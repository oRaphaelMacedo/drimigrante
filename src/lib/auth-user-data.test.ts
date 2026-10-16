import { describe, expect, it, vi } from 'vitest'
import type { Profile, Subscription } from '@/lib/database.types'
import {
  isSameSnapshot,
  loadUserDataWithRetry,
  UserDataLoadError,
  UserDataTimeoutError,
  type QueryResult,
  type UserDataQueries,
} from './auth-user-data'

const profile = { id: 'u1', full_name: 'Ana Souza' } as unknown as Profile
const subscription = {
  user_id: 'u1',
  one_time_paid: true,
  has_dashboard_access: true,
} as unknown as Subscription

function ok<T>(data: T): Promise<QueryResult<T>> {
  return Promise.resolve({ data, error: null })
}

function fail<T>(message: string, code?: string): Promise<QueryResult<T>> {
  return Promise.resolve({ data: null, error: { message, code } })
}

function queries(overrides: Partial<UserDataQueries> = {}): UserDataQueries {
  return {
    profile: () => ok(profile),
    subscription: () => ok(subscription),
    roles: () => ok([{ role: 'client' as const }]),
    ...overrides,
  }
}

const noSleep = () => Promise.resolve()

describe('loadUserDataWithRetry', () => {
  it('devolve perfil, assinatura e papéis', async () => {
    const snapshot = await loadUserDataWithRetry(queries(), { sleep: noSleep })
    expect(snapshot).toEqual({ profile, subscription, roles: ['client'] })
  })

  it('sem linha de assinatura (maybeSingle vazio) é "sem assinatura", não erro', async () => {
    const empty = (): Promise<QueryResult<Subscription>> =>
      Promise.resolve({ data: null, error: null })
    const snapshot = await loadUserDataWithRetry(queries({ subscription: empty }), {
      sleep: noSleep,
    })
    expect(snapshot.subscription).toBeNull()
  })

  it('timeout simulado vira UserDataLoadError, nunca subscription=null silencioso', async () => {
    const never = () => new Promise<QueryResult<Subscription>>(() => {})
    const onAttemptError = vi.fn()

    const promise = loadUserDataWithRetry(queries({ subscription: never }), {
      attempts: 2,
      timeoutMs: 5,
      sleep: noSleep,
      onAttemptError,
    })

    await expect(promise).rejects.toBeInstanceOf(UserDataLoadError)
    await promise.catch((error: UserDataLoadError) => {
      expect(error.attempts).toBe(2)
      expect(error.cause).toBeInstanceOf(UserDataTimeoutError)
    })
    expect(onAttemptError).toHaveBeenCalledTimes(2)
  })

  it('no timeout cancela as requisições da tentativa (AbortSignal)', async () => {
    const signals: AbortSignal[] = []
    const hang = (signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<QueryResult<Subscription>>(() => {})
    }
    await expect(
      loadUserDataWithRetry(queries({ subscription: hang }), {
        attempts: 1,
        timeoutMs: 5,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(UserDataLoadError)
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(true)
  })

  it('erro do PostgREST na assinatura também é falha (não "sem assinatura")', async () => {
    await expect(
      loadUserDataWithRetry(queries({ subscription: () => fail('JWT expired', 'PGRST301') }), {
        attempts: 1,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(UserDataLoadError)
  })

  it('erro nos papéis é falha (staff não pode virar cliente sem aviso)', async () => {
    await expect(
      loadUserDataWithRetry(queries({ roles: () => fail('network') }), {
        attempts: 1,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(UserDataLoadError)
  })

  it('erro só no perfil não é fatal', async () => {
    const onProfileError = vi.fn()
    const snapshot = await loadUserDataWithRetry(
      queries({ profile: () => fail<Profile>('boom') }),
      { sleep: noSleep, onProfileError },
    )
    expect(snapshot.profile).toBeNull()
    expect(snapshot.subscription).toEqual(subscription)
    expect(onProfileError).toHaveBeenCalledOnce()
  })

  it('tenta de novo com backoff exponencial e recupera', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve())
    let calls = 0
    const flaky = () => {
      calls++
      return calls < 3 ? fail<Subscription>('fetch failed') : ok(subscription)
    }

    const snapshot = await loadUserDataWithRetry(queries({ subscription: flaky }), {
      attempts: 3,
      baseDelayMs: 100,
      sleep,
    })

    expect(snapshot.subscription).toEqual(subscription)
    expect(sleep.mock.calls.map((call: [number]) => call[0])).toEqual([100, 200])
  })

  it('exceção lançada pela consulta também entra no retry', async () => {
    let calls = 0
    const throwsOnce = () => {
      calls++
      if (calls === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return ok(subscription)
    }
    const snapshot = await loadUserDataWithRetry(queries({ subscription: throwsOnce }), {
      sleep: noSleep,
    })
    expect(snapshot.subscription).toEqual(subscription)
  })
})

describe('isSameSnapshot', () => {
  it('compara pelo conteúdo', () => {
    const a = { profile, subscription, roles: [] }
    expect(isSameSnapshot(a, { profile, subscription, roles: [] })).toBe(true)
    expect(isSameSnapshot(a, { profile, subscription: null, roles: [] })).toBe(false)
  })
})
