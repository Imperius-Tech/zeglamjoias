// 100+ testes da INTENT_REGEX do group-candidate-extract (deploy em Supabase).
// Roda local: npx tsx scripts/test-intent-regex.ts
//
// Coloquiais "me add no grupo" / "Poderia … add … grupo" falhavam na V11 — usar V12 em produção.

const INTENT_REGEX_V11 = /(quero|gostaria|posso|como)\s+(de\s+)?(entrar|participar|fazer\s+parte|ingressar)|entrar\s+n[oe](?:\s+\S+)?\s+grupo|participar\s+d[oe](?:\s+\S+)?\s+grupo|fui\s+indicad[ao]|(?:uma?\s+)?(?:amiga?|amigo)\s+(?:me\s+)?indicou|indicou\s+(?:você|seu|seu\s+contato)|grupo\s+de\s+compras|compra(?:s)?\s+coletiva(?:s)?/i;

/** V11 + coloquial WhatsApp / marca. Deve ser copiado para group-candidate-extract no Supabase. */
const INTENT_REGEX_V12 = new RegExp(
  INTENT_REGEX_V11.source +
    '|(?:^|[\\s,.!?"])(?:me\\s+)?add\\s+(?:no|ao|em)\\s+grupo\\b|' +
    'poderia\\s+(?:me\\s+)?(?:add|incluir|cadastr(?:ar|r)?|colocar|botar)\\s+(?:no|ao|em)\\s+grupo\\b|' +
    '(?:^|[\\s,.!?"])(?:me\\s+)?adicion(?:a(?:r|-me)?|ei|ou)\\s+(?:no|ao|em)\\s+grupo\\b|' +
    '(?:cadastr(?:o|ar|a))\\s+(?:no|em)\\s+grupo\\b|' +
    '\\bno\\s+grupo\\s+zeglam\\b|' +
    '\\b(?:grupo|grupos)\\s+zeglam\\b',
  'i',
);

type Case = { msg: string; expected: boolean; note: string };

const TESTS: Case[] = [
  // ===== DEVE BATER (positive cases reais de clientes Zeglam) =====
  { msg: 'Gostaria de participar do seu grupo de compras', expected: true, note: 'caso real Eliana' },
  { msg: 'Oi Zevaldo gostaria de participar do seu grupo de compras', expected: true, note: 'saudacao + intent' },
  { msg: 'Quero entrar no grupo', expected: true, note: 'direto' },
  { msg: 'Quero entrar no grupo de compras', expected: true, note: 'com detalhe' },
  { msg: 'Quero participar do grupo', expected: true, note: 'direto' },
  { msg: 'Quero participar do seu grupo', expected: true, note: 'com posessivo' },
  { msg: 'Quero participar do seu grupo de compras', expected: true, note: 'longo' },
  { msg: 'Gostaria de entrar no grupo', expected: true, note: 'gostaria + de' },
  { msg: 'Gostaria de fazer parte do grupo', expected: true, note: 'fazer parte' },
  { msg: 'Gostaria de ingressar no grupo', expected: true, note: 'ingressar' },
  { msg: 'Posso entrar no grupo?', expected: true, note: 'pergunta' },
  { msg: 'Posso participar do grupo?', expected: true, note: 'pergunta' },
  { msg: 'Como entrar no grupo?', expected: true, note: 'como' },
  { msg: 'Como faço pra entrar no grupo?', expected: true, note: 'como faco' },
  { msg: 'Como participar?', expected: true, note: 'como participar' },
  { msg: 'Como faço pra participar do grupo de compras coletivas?', expected: true, note: 'longo' },
  { msg: 'Fui indicada pela Maria', expected: true, note: 'indicacao feminina' },
  { msg: 'Fui indicado pelo João', expected: true, note: 'indicacao masculina' },
  { msg: 'Fui indicada pela minha amiga', expected: true, note: 'indicacao amiga' },
  { msg: 'uma amiga me indicou', expected: true, note: 'uma amiga' },
  { msg: 'Uma amiga indicou seu contato', expected: true, note: 'amiga indicou' },
  { msg: 'Minha amiga indicou você', expected: true, note: 'amiga voce' },
  { msg: 'A Lana me passou seu contato para entrar no grupo', expected: true, note: 'caso real Luciana' },
  { msg: 'grupo de compras', expected: true, note: 'frase curta' },
  { msg: 'grupo de compras coletivas', expected: true, note: 'coletivas' },
  { msg: 'compras coletivas', expected: true, note: 'coletivas sem grupo' },
  { msg: 'compra coletiva', expected: true, note: 'singular' },
  { msg: 'Oi, quero participar do grupo de compras', expected: true, note: 'saudacao + intent' },
  { msg: 'Bom dia! Gostaria de participar do grupo', expected: true, note: 'bom dia' },
  { msg: 'Boa tarde, me chamo Ana, gostaria de entrar no grupo', expected: true, note: 'apresenta + intent' },
  { msg: 'Oi Zevaldo, gostaria de participar', expected: true, note: 'sem grupo' },
  { msg: 'Gostaria de participar', expected: true, note: 'simples' },
  { msg: 'Quero participar', expected: true, note: 'simples' },
  { msg: 'Quero entrar', expected: true, note: 'entrar simples' },
  { msg: 'Quero ingressar no grupo', expected: true, note: 'ingressar' },
  { msg: 'Quero fazer parte do grupo', expected: true, note: 'fazer parte' },
  { msg: 'GOSTARIA DE PARTICIPAR DO GRUPO', expected: true, note: 'maiusculas' },
  { msg: 'gostaria   de    participar', expected: true, note: 'espacos extras' },
  { msg: 'participar do grupo de compras', expected: true, note: 'sem verbo inicial' },
  { msg: 'entrar no grupo de compras', expected: true, note: 'sem verbo inicial' },
  { msg: 'Oi, a Joana me indicou pra entrar no grupo', expected: true, note: 'indicacao pessoa' },
  { msg: 'Sou Maria, fui indicada pela Suelen', expected: true, note: 'indicacao feminina nome' },
  { msg: 'Ola, indicaram seu contato pra participar do grupo', expected: true, note: 'indicaram' },
  { msg: 'oi quero entrar no grupo', expected: true, note: 'minuscula' },
  { msg: 'Bom dia, gostaria de entrar no grupo de compras coletivas', expected: true, note: 'completo' },
  { msg: 'Tenho interesse em entrar no grupo', expected: true, note: 'interesse' },
  { msg: 'Pode me incluir no grupo de compras?', expected: true, note: 'incluir grupo compras' },
  { msg: 'Posso fazer parte do grupo?', expected: true, note: 'fazer parte' },
  { msg: 'Amiga me indicou', expected: true, note: 'amiga indicou curto' },
  { msg: 'Amigo me indicou', expected: true, note: 'amigo' },
  { msg: 'indicou seu contato', expected: true, note: 'indicou contato' },
  { msg: 'Meu marido me indicou seu contato', expected: true, note: 'indicou seu contato' },
  { msg: 'Quero entrar no seu grupo', expected: true, note: 'entrar seu grupo' },
  { msg: 'Gostaria de entrar no seu grupo', expected: true, note: 'gostaria entrar seu' },
  { msg: 'Participar do grupo de semijoias', expected: true, note: 'participar semijoias' },

  // ===== NAO DEVE BATER (negative cases) =====
  { msg: 'Oi, bom dia', expected: false, note: 'saudacao simples' },
  { msg: 'Tem o link?', expected: false, note: 'pedido link' },
  { msg: 'Qual o valor do frete?', expected: false, note: 'valor frete' },
  { msg: 'Meu pedido chegou', expected: false, note: 'pedido chegou' },
  { msg: 'Obrigada', expected: false, note: 'agradecimento' },
  { msg: 'Chave pix?', expected: false, note: 'pix' },
  { msg: 'Tem promoção?', expected: false, note: 'promocao' },
  { msg: 'Qualidade boa?', expected: false, note: 'qualidade' },
  { msg: 'Ok beleza', expected: false, note: 'confirmacao' },
  { msg: 'Quando chega?', expected: false, note: 'entrega' },
  { msg: 'Preciso de ajuda', expected: false, note: 'ajuda generica' },
  { msg: 'Grupo de vendas', expected: false, note: 'grupo vendas NAO compras' },
  { msg: 'Participar de outro negocio', expected: false, note: 'participar generico' },
  { msg: 'Quero comprar', expected: false, note: 'quero comprar (nao grupo)' },
  { msg: 'Qual o preço?', expected: false, note: 'preco' },
  { msg: 'Boa tarde', expected: false, note: 'saudacao' },

  // ===== EDGE CASES =====
  { msg: 'gostariadeparticipar', expected: false, note: 'sem espacos NAO bate' },
  { msg: 'quero', expected: false, note: 'so verbo' },
  { msg: '', expected: false, note: 'vazio' },
  { msg: 'grupo', expected: false, note: 'so grupo' },
  { msg: 'a compra foi coletiva', expected: false, note: 'falso - tem palavra no meio, nao bate regex' },
  { msg: 'participa do grupo X?', expected: false, note: 'participa 3a pessoa' }, // pergunta dele
  { msg: 'quero participar da live', expected: true, note: 'falso positivo - regex pega quero+participar. Raro em producao.' },
  { msg: 'como vc ta?', expected: false, note: 'como vc' },
  { msg: 'posso te enviar o comprovante?', expected: false, note: 'posso enviar' },
  { msg: 'como pago?', expected: false, note: 'como pago' },
  { msg: 'fazer parte da familia', expected: false, note: 'fazer parte familia (sem quero/gostaria)' },
  { msg: 'Não quero mais participar do grupo', expected: true, note: 'negacao - aceita pq tem intent pattern. OK pq vai filtrar depois' },

  // ===== VARIACOES COLOQUIAIS =====
  { msg: 'queria entrar no grupo', expected: true, note: 'queria - pega pela parte entrar no grupo' },
  { msg: 'kero participar do grupo', expected: true, note: 'typo kero - pega pela parte participar do grupo' },
  { msg: 'vc pode me add no grupo?', expected: true, note: 'add no grupo (V12)' },
  { msg: 'tenho interesse no grupo de compras', expected: true, note: 'interesse grupo compras (bate grupo de compras)' },
  { msg: 'interesse em participar do grupo', expected: true, note: 'interesse participar grupo' },
  { msg: 'oi me adiciona no grupo?', expected: true, note: 'me adiciona (V12)' },
  { msg: 'quero compras coletivas', expected: true, note: 'bate compras coletivas' },
  { msg: 'me add no grupo de compras', expected: true, note: 'bate grupo de compras' },

  // ===== CASOS REAIS DO HISTORICO ZEGLAM =====
  { msg: 'Oi Zevaldo gostaria de participar do seu grupo de compras', expected: true, note: 'real 1' },
  { msg: 'Boa tarde. Me chamo Luciana. A Lana me passou seu contato para entrar no grupo de compras de semijoias.', expected: true, note: 'real 2' },
  { msg: 'Boa tarde, Zevaldo!!\nSou Eliana Castro, de Campinas. Gostaria de participar do seu grupo de compras.', expected: true, note: 'real Eliana multiline' },
  { msg: 'Oi! Fui indicada pela Juliana pra entrar no grupo', expected: true, note: 'real indicacao' },
  { msg: 'boa noite, minha amiga me passou seu contato, queria entrar no grupo', expected: true, note: 'real amiga passou' },
  { msg: 'Oii, gostaria de saber sobre o grupo de compras coletivas', expected: true, note: 'real gostaria saber' },
  { msg: 'Bom dia, gostaria de saber como faço para participar do seu grupo de compras coletivas?', expected: true, note: 'real como faço' },
  { msg: 'Olá, boa tarde! Gostaria de participar', expected: true, note: 'real simples' },
  { msg: 'Tudo bem? Fui indicada pela Vanessa pra entrar no grupo de compras coletivas', expected: true, note: 'real' },
  { msg: 'Oii, vc tem o link?', expected: false, note: 'real pedido link' },
  { msg: 'Oi, posso pagar o frete agora?', expected: false, note: 'real frete' },
  { msg: 'Boa tarde, o produto chegou com defeito', expected: false, note: 'real reclamacao' },
  { msg: 'Qual o valor do frete pra Campinas?', expected: false, note: 'real valor' },

  // Caso relatado 2026-05: WhatsApp Business — não batia na V11
  { msg: 'Poderia me add no grupo ZEGLAM?', expected: true, note: 'real poderia add zeglam' },
  { msg: 'Indicação de Mabilia.', expected: false, note: 'só indicação sem grupo (multilinha depende do extract)' },
];

function runSuite(name: string, rx: RegExp) {
  let pass = 0;
  const failures: Case[] = [];
  for (const t of TESTS) {
    const got = rx.test(t.msg);
    if (got === t.expected) pass++;
    else failures.push(t);
  }
  console.log(`\n====== ${name}: ${pass}/${TESTS.length} pass, ${failures.length} fail ======\n`);
  if (failures.length) {
    console.log('FALHAS:');
    for (const f of failures) {
      const got = rx.test(f.msg);
      console.log(`  [${f.note}] msg="${f.msg.slice(0, 70)}" expected=${f.expected} got=${got}`);
    }
  }
}

runSuite('INTENT_REGEX_V11 (legado)', INTENT_REGEX_V11);
runSuite('INTENT_REGEX_V12 (recomendado)', INTENT_REGEX_V12);
