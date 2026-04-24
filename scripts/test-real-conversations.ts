// Testa regex INTENT_REGEX_V11 contra 1as msgs REAIS de conversas que entraram no fluxo de grupo
const INTENT_REGEX_V11 = /(quero|gostaria|posso|como)\s+(de\s+)?(entrar|participar|fazer\s+parte|ingressar)|entrar\s+n[oe](?:\s+\S+)?\s+grupo|participar\s+d[oe](?:\s+\S+)?\s+grupo|fui\s+indicad[ao]|(?:uma?\s+)?(?:amiga?|amigo)\s+(?:me\s+)?indicou|indicou\s+(?:você|seu|seu\s+contato)|grupo\s+de\s+compras|compra(?:s)?\s+coletiva(?:s)?/i;

// 1as msgs reais de conversas group_candidate_status NOT NULL (últimos 15 dias)
const REAL_FIRST_MSGS: { name: string; msg: string; status: string; shouldHaveIntent: boolean; note: string }[] = [
  { name: 'Joao Pedro', msg: 'Olá poderia', status: 'dados_coletados', shouldHaveIntent: false, note: '1a msg vaga' },
  { name: 'Jadne', msg: '[Mídia]', status: 'intent_detectado', shouldHaveIntent: false, note: 'media' },
  { name: 'D’Casari Semijoias', msg: 'Oi Zevaldo bom dia!', status: 'aguardando_dados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Barbara Lucena', msg: 'Boa tarde! TUdo bem?Gostaria de entrar no grupo conecta', status: 'dados_coletados', shouldHaveIntent: true, note: 'gostaria entrar grupo' },
  { name: 'Giovana Guioto Xavier', msg: 'Gostaria de participar do seu grupo de compras coletivas', status: 'dados_coletados', shouldHaveIntent: true, note: 'gostaria participar' },
  { name: 'D\'MOAR Semijoias', msg: 'Bom dia Zé Valdo tudo bem, poderia me incluir no seu grupo de compras coletivas', status: 'intent_detectado', shouldHaveIntent: true, note: 'poderia me incluir grupo de compras' },
  { name: 'Lilian Dias', msg: 'Boa noite, tudo bem? Eu gostaria de entrar no grupo, por gentileza. Obrigada.', status: 'dados_coletados', shouldHaveIntent: true, note: 'gostaria entrar grupo' },
  { name: 'Amanda', msg: 'Olá', status: 'dados_coletados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Ana Franco Semijoias', msg: 'Zé', status: 'recusada', shouldHaveIntent: false, note: 'pronome' },
  { name: 'Janice Monteiro', msg: 'Boa tarde, senhor Zevaldo, tudo bem?\n\nMeu nome é Janice, gostaria de solicitar para entrar no grupo coletivo, venho por indicação da Lana, minha marca se chama Elizabrielle.', status: 'recusada', shouldHaveIntent: true, note: 'gostaria entrar grupo + indicacao' },
  { name: 'Vanessa', msg: 'Solicito, por gentileza, o envio das seguintes informações:\n• Nome completo: Vanessa taisa santos da silva', status: 'intent_detectado', shouldHaveIntent: false, note: 'template echo (cliente mandou dados sem intent)' },
  { name: 'Natalia', msg: 'Bom dia', status: 'intent_detectado', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Andreia Semi Joias 18k', msg: 'Olá', status: 'dados_coletados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Michele S&M semi joias', msg: 'Solicito, por gentileza, o envio das seguintes informações:\n• Nome completo Michele Teixeira de Melo', status: 'dados_coletados', shouldHaveIntent: false, note: 'template echo' },
  { name: 'Fe Menezes', msg: 'Bom dia! Me chamo Fernanda Menezes, recebi seu contato em um grupo de semijoias, gostaria de participar do grupo de compra coletiva de brutos.', status: 'intent_detectado', shouldHaveIntent: true, note: 'gostaria participar grupo de compra coletiva' },
  { name: 'Eliana', msg: 'Boa tarde, Zevaldo!!\nSou Eliana Castro, de Campinas. Gostaria de participar do seu grupo de compras.', status: 'aguardando_dados', shouldHaveIntent: true, note: 'caso real bugado antes v11' },
  { name: 'Nadyer Joias', msg: 'Oii Zevaldo, boa noite!', status: 'recusada', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Eliane Lia', msg: '👤 Contato: Ellen Moraes Integra', status: 'aguardando_dados', shouldHaveIntent: false, note: 'contact card' },
  { name: 'Marcos Silva', msg: 'Fala Zevaldo tudo bem? Ótimo diqa', status: 'aguardando_dados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Carol', msg: 'Oi bom dia \nRecebi indicação seu para entrar no grupo de compras coletivas', status: 'aguardando_dados', shouldHaveIntent: true, note: 'recebi indicacao + entrar grupo' },
  { name: 'Fabio Caetano', msg: '[Áudio]', status: 'recusada', shouldHaveIntent: false, note: 'audio' },
  { name: 'Sol', msg: 'Olá bom da', status: 'dados_coletados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Joanna', msg: 'bom dia', status: 'dados_coletados', shouldHaveIntent: false, note: 'saudacao' },
  { name: 'Ellen Moraes', msg: '[Audio]', status: 'dados_coletados', shouldHaveIntent: false, note: 'audio' },
  { name: 'Cleze Garlene', msg: 'Desculpa! Liguei sem querer.', status: 'dados_coletados', shouldHaveIntent: false, note: 'ruido' },
  { name: 'Gustavo Santos', msg: 'Zevaldo, vou fazer alguns testes aqui, então não ligue por favor, ok?', status: 'adicionada', shouldHaveIntent: false, note: 'teste interno' },
];

let pass = 0, fail = 0;
const failures: typeof REAL_FIRST_MSGS = [];

for (const t of REAL_FIRST_MSGS) {
  const got = INTENT_REGEX_V11.test(t.msg);
  if (got === t.shouldHaveIntent) pass++;
  else { fail++; failures.push(t); }
}

console.log(`\n====== MENSAGENS REAIS: ${pass}/${REAL_FIRST_MSGS.length} pass, ${fail} fail ======\n`);
if (failures.length) {
  console.log('FALHAS (intent esperado mas regex nao bate):');
  for (const f of failures) {
    const got = INTENT_REGEX_V11.test(f.msg);
    console.log(`  [${f.name}] expected=${f.shouldHaveIntent} got=${got}`);
    console.log(`    msg: "${f.msg.slice(0, 150).replace(/\n/g, ' / ')}"`);
    console.log(`    note: ${f.note}`);
  }
}

// Analise: quantas dessas primeiras msgs TEM intent explicito?
const withIntent = REAL_FIRST_MSGS.filter(t => t.shouldHaveIntent).length;
const withoutIntent = REAL_FIRST_MSGS.filter(t => !t.shouldHaveIntent).length;
console.log(`\nDistribuicao: ${withIntent} com intent, ${withoutIntent} sem intent na 1a msg`);
console.log(`Das ${withoutIntent} sem intent, todas entraram no fluxo mesmo assim (intent veio em msgs seguintes)\n`);
