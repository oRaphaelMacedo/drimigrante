# Higiene do repositório (DI-089)

## Já feito

- `.spec/.usage.jsonl` (telemetria local do Spec Kit: comando, tokens e custo)
  saiu do git (`git rm --cached`) e está no `.gitignore`. O arquivo continua na
  máquina de quem o tem; ao fazer merge desta mudança, o git o remove das outras
  cópias de trabalho. Guarde uma cópia antes, se quiser o histórico.
- `deno.lock` está no `.gitignore` (gerado por `deno test`/`deno check`; o CI
  roda com `--no-config` e não usa lockfile).
- `scripts/generate-quiz-seed.mjs` nunca sobrescreve migrations e não gera mais
  `TRUNCATE` (ver "Seed do quiz a partir do código" em [../testes.md](../testes.md)).

## Limpeza recomendada (só com aprovação do dono)

Nada abaixo foi apagado. A orquestração das ondas ainda usa as branches
`onda*/` e os worktrees em `.claude/worktrees/wf_*`: não mexa neles até o fim
das ondas.

| Item | Situação em 16/10/2026 | Antes de remover |
|---|---|---|
| Branches locais `claude/awesome-hofstadter-6e01d1`, `claude/naughty-montalcini-d38cd0`, `claude/wizardly-gates-586605` | Já incorporadas na `main` (`git branch --merged main`) | Nada a conferir |
| Branches remotas `origin/claude/awesome-hofstadter-6e01d1`, `origin/claude/wizardly-gates-586605` | Já incorporadas na `main` | Apagar no GitHub exige aprovação |
| Worktree `.claude/worktrees/naughty-montalcini-d38cd0` | Pode ter alterações não commitadas | Ver o diff (comandos abaixo) e decidir se algo deve ser salvo |
| 15 modelos duplicados do Spec Kit em `.spec/*-template.md`, `.spec/shell-instructions.md`, `.spec/custom-constitution-principles.json` e `.spec/custom_constitution_principles/` | Idênticos byte a byte aos de `.spec/templates/` | Confirmar qual cópia o Spec Kit lê antes de apagar a outra |

Comandos, na raiz do repositório e só depois da aprovação:

```bash
# 1. Conferir o worktree antes de removê-lo
git -C .claude/worktrees/naughty-montalcini-d38cd0 status --short
git -C .claude/worktrees/naughty-montalcini-d38cd0 diff
git worktree remove .claude/worktrees/naughty-montalcini-d38cd0

# 2. Branches locais já incorporadas (-d recusa se não estiver na main)
git branch -d claude/awesome-hofstadter-6e01d1 claude/naughty-montalcini-d38cd0 claude/wizardly-gates-586605

# 3. Branches remotas
git push origin --delete claude/awesome-hofstadter-6e01d1 claude/wizardly-gates-586605
```
