/**
 * Idioma e textos compartilhados do funil público (DI-074).
 *
 * Decisão (até o dono vetar): **pt-BR com "você"** em todo o funil, porque o
 * público é majoritariamente brasileiro. `<html lang="pt-BR">`, `og:locale`
 * pt_BR e o manifest do PWA seguem a mesma regra. Termos oficiais portugueses
 * (AIMA, Registo Criminal, Conservatória…) ficam como são.
 *
 * O glossário (formas de Portugal → pt-BR) e o verificador `findPtPtMarkers`
 * ficam em src/lib/copy-glossary.ts, usado só pelos testes (copy.test.ts).
 * Este módulo vai para o bundle do cliente (Header, Landing, 404): mantenha-o
 * só com constantes de texto, sem regex com lookbehind nem `\p{…}`, que o
 * Safari abaixo do iOS 16.4 não entende (SyntaxError ao carregar a página).
 */

/** Rótulo único do CTA que leva ao quiz (header, landing e barra fixa). */
export const QUIZ_CTA_LABEL = 'Fazer o diagnóstico grátis'
