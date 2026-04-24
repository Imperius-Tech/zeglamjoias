// 20 testes: se regex INTENT bate na msg, fluxo bloqueia ai-reply e dispara template
// Simula comportamento de process-pending (quem decide skipAiReply)

const INTENT_REGEX_V12 = /(quero|gostaria|posso|como)\s+(de\s+)?(entrar|participar|fazer\s+parte|ingressar)|entrar\s+n[oe](?:\s+\S+)?\s+grupo|participar\s+d[oe](?:\s+\S+)?\s+grupo|fui\s+indicad[ao]|(?:uma?\s+)?(?:amiga?|amigo)\s+(?:me\s+)?indicou|indicou\s+(?:você|seu|seu\s+contato)|grupo\s+de\s+compras|compra(?:s)?\s+coletiva(?:s)?/i;

// process-pending chama group-candidate-extract PRIMEIRO.
// Se retornar status ∈ {intent_detectado, aguardando_dados, dados_coletados} → skipAiReply = true.
// A msg pedida é "Olá, boa noite, quero entrar no grupo, vanessa me indicou"
// Fluxo real para 1ª msg nova (sem group_candidate_data prévio):
//   - hasIntent(msg) = true (bate "quero entrar no grupo" E "vanessa me indicou" via "indicou")
//   - alreadyInFlow = false (conversation nova)
//   - templateSent = false (nenhum template ainda)
//   - conv.group_candidate_data = null
//   - Entra no branch: NOT templateSent AND NOT group_candidate_data
//     → seta status = 'intent_detectado'
//     → RETURNA (early return) sem extrair, sem mandar ask-missing
//   - process-pending vê status='intent_detectado' → skipAiReply=TRUE ✓

// PORÉM: tem um gap. `intent_detectado` só seta o status. Ele NÃO dispara template automaticamente.
// send-group-intake-template é chamado por OUTRO lugar (atualmente manual via UI ou webhook event específico).
// Vou verificar isso também.

const BASE_MSG = 'Olá, boa noite, quero entrar no grupo, vanessa me indicou';

// 20 variações da mesma intent
const MSGS = [
  'Olá, boa noite, quero entrar no grupo, vanessa me indicou',
  'Oi, bom dia, quero entrar no grupo, Vanessa me indicou',
  'Boa tarde! Quero entrar no grupo, a Vanessa me indicou',
  'oi quero entrar no grupo a vanessa me indicou',
  'Olá Zevaldo, quero entrar no grupo, Vanessa me indicou',
  'Boa noite, gostaria de entrar no grupo, Vanessa indicou',
  'Oi, gostaria de participar do grupo, Vanessa me indicou',
  'quero entrar no grupo vanessa me indicou',
  'OLÁ BOA NOITE QUERO ENTRAR NO GRUPO VANESSA ME INDICOU',
  'Olá! Boa noite! Quero entrar no grupo! Vanessa me indicou!',
  'olá, boa noite, quero entrar no grupo, vanessa me indicou 😊',
  'Oi tudo bem? Quero entrar no grupo, a Vanessa me indicou',
  'Olá, boa noite, gostaria de entrar no grupo de compras, Vanessa me indicou',
  'Boa noite, fui indicada pela Vanessa e quero entrar no grupo',
  'Oi quero entrar no grupo, minha amiga Vanessa me indicou',
  'Olá! Quero entrar no grupo de compras coletivas, Vanessa me indicou',
  'boa noite quero entrar no grupo vanessa indicou seu contato',
  'Olá, boa noite, gostaria de participar do grupo, Vanessa me passou seu contato',
  'Oi quero entrar no grupo da zeglam, Vanessa me indicou',
  'Olá, quero participar do grupo de compras, Vanessa me indicou',
];

let pass = 0, fail = 0;
const failures: string[] = [];

for (const msg of MSGS) {
  const intentDetected = INTENT_REGEX_V12.test(msg);
  if (intentDetected) pass++;
  else { fail++; failures.push(msg); }
}

console.log(`\n====== TESTE INTENT REGEX ======`);
console.log(`${pass}/${MSGS.length} mensagens detectaram intent corretamente`);
if (failures.length) {
  console.log('FALHAS:');
  for (const f of failures) console.log(`  - "${f}"`);
}

console.log(`\n====== FLUXO ESPERADO ======`);
console.log(`Para mensagem: "${BASE_MSG}"`);
console.log(`1. Webhook salva msg + schedulePendingReply (12s)`);
console.log(`2. Cron process-pending (10s) dispara group-candidate-extract`);
console.log(`3. group-candidate-extract v12:`);
console.log(`   - hasIntent=true ✓`);
console.log(`   - templateSent=false, group_candidate_data=null`);
console.log(`   - Entra no early return: seta status='intent_detectado'`);
console.log(`4. process-pending vê status='intent_detectado' → skipAiReply=TRUE ✓`);
console.log(`5. ai-reply NÃO é chamado. Sugestão IA NÃO aparece no painel.`);
console.log(``);
console.log(`⚠️ GAP IDENTIFICADO: group-candidate-extract NÃO dispara o template automaticamente.`);
console.log(`   Template intake (4 msgs) só é enviado por:`);
console.log(`   - Clicar botão manual em algum lugar`);
console.log(`   - Chamada direta à send-group-intake-template`);
console.log(`   - NÃO há cron/trigger chamando automaticamente quando status vira intent_detectado`);
console.log(``);
console.log(`CONCLUSÃO: SE regex bate, ai-reply é bloqueado (correto).`);
console.log(`           MAS template NÃO dispara sozinho, precisa trigger manual.`);
