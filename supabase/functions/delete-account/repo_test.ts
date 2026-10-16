// Testes do repo do delete-account (DI-083): listagem recursiva do Storage,
// remoção em lotes, mapeamento das recusas da RPC e do Auth. Sem rede.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { assert, assertEquals } from '../_shared/test-asserts.ts'
import { EraseRefusedError, USER_DOCUMENTS_BUCKET } from './handler.ts'
import { createDeleteAccountRepo } from './repo.ts'

const USER = 'u-1'

type Item = { name: string; id: string | null }

function fakeDb(opts: {
  tree?: Record<string, Item[]>
  rpc?: { data?: unknown; error?: { message: string; code?: string } | null }
  deleteUserError?: { message: string; status?: number } | null
  roles?: string[]
} = {}) {
  const listCalls: string[] = []
  const removeCalls: Array<{ bucket: string; paths: string[] }> = []
  const rpcCalls: Array<{ name: string; args: unknown }> = []
  const db = {
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
          listCalls.push(`${bucket}:${prefix}:${offset}`)
          const all = opts.tree?.[prefix] ?? []
          return Promise.resolve({ data: all.slice(offset, offset + limit), error: null })
        },
        remove: (paths: string[]) => {
          removeCalls.push({ bucket, paths })
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({ data: opts.rpc?.data ?? null, error: opts.rpc?.error ?? null })
    },
    auth: {
      admin: {
        deleteUser: (_id: string) => Promise.resolve({ data: null, error: opts.deleteUserError ?? null }),
      },
    },
    from: (_table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        neq: (_c: string, value: string) => {
          ;(chain as { _rows?: unknown[] })._rows = (opts.roles ?? []).filter((r) => r !== value).map((role) => ({
            role,
          }))
          return chain
        },
        limit: () => Promise.resolve({ data: (chain as { _rows?: unknown[] })._rows ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: { stripe_subscription_id: 'sub_ABC123def' }, error: null }),
      }
      return chain
    },
  }
  return { client: db as unknown as SupabaseClient, listCalls, removeCalls, rpcCalls }
}

Deno.test('listUserFiles percorre as subpastas de {user_id}/ e ignora placeholders', async () => {
  const { client } = fakeDb({
    tree: {
      [USER]: [{ name: 'general', id: null }, { name: 'a1', id: null }, { name: '.emptyFolderPlaceholder', id: 'x' }],
      [`${USER}/general`]: [{ name: 'passaporte', id: null }],
      [`${USER}/general/passaporte`]: [{ name: '1.pdf', id: 'f1' }],
      [`${USER}/a1`]: [{ name: 'nif', id: null }],
      [`${USER}/a1/nif`]: [{ name: '2.png', id: 'f2' }, { name: '3.pdf', id: 'f3' }],
    },
  })
  const files = await createDeleteAccountRepo(client).listUserFiles(USER)
  assertEquals(files.sort(), [`${USER}/a1/nif/2.png`, `${USER}/a1/nif/3.pdf`, `${USER}/general/passaporte/1.pdf`])
})

Deno.test('listUserFiles pagina (1000 por página)', async () => {
  const many = Array.from({ length: 1500 }, (_, i) => ({ name: `${i}.pdf`, id: `f${i}` }))
  const { client, listCalls } = fakeDb({ tree: { [USER]: many } })
  const files = await createDeleteAccountRepo(client).listUserFiles(USER)
  assertEquals(files.length, 1500)
  assertEquals(listCalls, [`${USER_DOCUMENTS_BUCKET}:${USER}:0`, `${USER_DOCUMENTS_BUCKET}:${USER}:1000`])
})

Deno.test('removeFiles remove em lotes de 100', async () => {
  const { client, removeCalls } = fakeDb()
  const paths = Array.from({ length: 250 }, (_, i) => `${USER}/${i}.pdf`)
  await createDeleteAccountRepo(client).removeFiles(USER_DOCUMENTS_BUCKET, paths)
  assertEquals(removeCalls.map((c) => c.paths.length), [100, 100, 50])
})

Deno.test('eraseUser chama a RPC com o usuário e lê pagamentos guardados e anexos', async () => {
  const { client, rpcCalls } = fakeDb({
    rpc: { data: { payments_retained: 2, case_document_paths: ['hub/c1/a.pdf', '', 7] } },
  })
  const result = await createDeleteAccountRepo(client).eraseUser(USER)
  assertEquals(rpcCalls, [{ name: 'lgpd_erase_user', args: { p_user_id: USER, p_source: 'self_service' } }])
  assertEquals(result, { paymentsRetained: 2, caseDocumentPaths: ['hub/c1/a.pdf'] })
})

Deno.test('eraseUser traduz staff_account/open_case em EraseRefusedError; outros erros sobem', async () => {
  for (const code of ['staff_account', 'open_case'] as const) {
    const { client } = fakeDb({ rpc: { error: { message: code, code: 'P0001' } } })
    let caught: unknown = null
    try {
      await createDeleteAccountRepo(client).eraseUser(USER)
    } catch (err) {
      caught = err
    }
    assert(caught instanceof EraseRefusedError && caught.code === code, code)
  }
  const { client } = fakeDb({
    rpc: { error: { message: 'function public.lgpd_erase_user does not exist', code: '42883' } },
  })
  let caught: unknown = null
  try {
    await createDeleteAccountRepo(client).eraseUser(USER)
  } catch (err) {
    caught = err
  }
  assert(caught && !(caught instanceof EraseRefusedError), 'erro genérico não vira recusa')
})

Deno.test('deleteAuthUser: 404 (já apagado) é sucesso; outros erros sobem', async () => {
  await createDeleteAccountRepo(fakeDb({ deleteUserError: { message: 'User not found', status: 404 } }).client)
    .deleteAuthUser(USER)
  let failed = false
  try {
    await createDeleteAccountRepo(fakeDb({ deleteUserError: { message: 'Database error', status: 500 } }).client)
      .deleteAuthUser(USER)
  } catch {
    failed = true
  }
  assert(failed)
})

Deno.test('hasStaffRole ignora o papel client', async () => {
  assertEquals(await createDeleteAccountRepo(fakeDb({ roles: ['client'] }).client).hasStaffRole(USER), false)
  assertEquals(
    await createDeleteAccountRepo(fakeDb({ roles: ['client', 'hub_admin'] }).client).hasStaffRole(USER),
    true,
  )
})
