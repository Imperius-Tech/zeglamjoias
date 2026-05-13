# Referência de Requisições Internas (Zeglam Semijoias)

Este documento centraliza os payloads, rotas nativas e estruturas de resposta interceptadas do sistema da Zeglam (`semijoias.net`) para futuras integrações e extrações diretas de dados do backend.

---

## 1. Histórico de Expedição (Dispatch History)
Busca a lista completa de pacotes despachados e prontos para envio, retornando a paginação completa, dados do cliente, transportadora, pesos e links de ação.

- **URL:** `POST https://zeglam.semijoias.net/admin/services/view`
- **Headers Principais:**
  - `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
  - `X-Requested-With: XMLHttpRequest`
- **Origem do JWT (`Source`):** `virtualcatalog/dispatch`
- **Payload (`data-raw` decodificado):**
  ```http
  Filter=HISTORY&JWT=<TOKEN_JWT_VALIDO>&Path=virtualcatalog/dispatch
  ```

### 📦 Estrutura do Retorno Identificada
O servidor retorna os itens da lista em HTML contendo os seguintes atributos de dados:
- **Cliente:** Nome e ID para consulta detalhada (`Main.getObj('Customer').openInfo(ID)`)
- **Data do Despacho**
- **Valor do Frete**
- **Qtd Produtos e Peso** (ex: `30 (800 gramas)`)
- **Transportadora** (ex: `SuperFrete`)
- **Ações e Gatilhos Nativos no HTML:**
  - Listar Links: `VirtualCatalog.openDeliveryDetails(DeliveryID)`
  - Emitir NFe: `Main.getObj('NotaFiscal').openFormNotaFiscalGrupoDelivery(DeliveryID)`
  - Etiqueta: `VirtualCatalog.openDeliveryLabel(DeliveryID)`

### 💻 cURL Original Interceptado:
```bash
curl "https://zeglam.semijoias.net/admin/services/view" \
  -H "Accept: */*" \
  -H "Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,ru;q=0.6,pt-PT;q=0.5,es;q=0.4" \
  -H "Connection: keep-alive" \
  -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
  -b "ctl-sess-id=69e95e5fdc193; cookies-ctl=..." \
  -H "Origin: https://zeglam.semijoias.net" \
  -H "Referer: https://zeglam.semijoias.net/admin/" \
  -H "Sec-Fetch-Dest: empty" \
  -H "Sec-Fetch-Mode: cors" \
  -H "Sec-Fetch-Site: same-origin" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 OPR/131.0.0.0" \
  -H "X-Requested-With: XMLHttpRequest" \
  --data-raw "Filter=HISTORY&JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg2Mzc3NTAsImlzcyI6IlNlbWlqb2lhcyIsImV4cCI6MTc3ODYzNzg3MCwiZGF0YSI6eyJTb3VyY2UiOiJ2aXJ0dWFsY2F0YWxvZ1wvZGlzcGF0Y2gifX0%3D.9raMBUdsTBdt%2Fdi3KDlqDZiO2VtWU2gwP49Zesz73kk%3D&Path=virtualcatalog%2Fdispatch"
```

---

## 2. Dados e PDF da Etiqueta de Entrega (Delivery Label)
Requisita a renderização do modal contendo os dados completos de envio, rastreamento, endereço do cliente e o link direto para o PDF da etiqueta na transportadora a partir do `DeliveryID`.

- **URL:** `POST https://zeglam.semijoias.net/admin/services/view`
- **Headers Principais:**
  - `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
  - `X-Requested-With: XMLHttpRequest`
- **Origem do JWT (`Source`):** `virtualcatalog/delivery-label`
- **Payload (`data-raw` decodificado):**
  ```http
  DeliveryID=2&JWT=<TOKEN_JWT_VALIDO>&Path=virtualcatalog/delivery-label
  ```

### 🏷️ Estrutura do Retorno Identificada (`DeliveryID: 2`)
O servidor devolve a estrutura completa do modal HTML contendo:
- **Cliente / Telefone:** `Josyanne Caroline De Andrade - (31) 99854-1571`
- **Transportadora / Valor:** `SuperFrete - R$ 31,27` (`SEDEX`)
- **Endereço Completo:** `Rua Tapijara, 844, apt 101, Novo eldorado, Contagem (MG), CEP 32341160`
- **ID da Etiqueta Interna:** `hwfwYLIMdlHfWLdMF9LF`
- **URL Direta para o PDF da Etiqueta:** `https://etiqueta.superfrete.com/_etiqueta/pdf/JVnL7l92TJwJY80JzpkB?format=A4`
- **Status:** `Entrega confirmada em 03/03/2026 10:10`
- **Ações e Gatilhos Nativos no HTML:**
  - Cancelar Envio: `VirtualCatalog.cancelDeliveryGateway(0, DeliveryID)`
  - Excluir Envio: `VirtualCatalog.deleteDelivery(DeliveryID)`
  - Etiqueta Separação: `VirtualCatalog.printDeliveryLabelCorreios(DeliveryID)`

### 💻 cURL Original Interceptado:
```bash
curl "https://zeglam.semijoias.net/admin/services/view" \
  -H "Accept: */*" \
  -H "Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,ru;q=0.6,pt-PT;q=0.5,es;q=0.4" \
  -H "Connection: keep-alive" \
  -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
  -b "ctl-sess-id=69e95e5fdc193; cookies-ctl=..." \
  -H "Origin: https://zeglam.semijoias.net" \
  -H "Referer: https://zeglam.semijoias.net/admin/" \
  -H "Sec-Fetch-Dest: empty" \
  -H "Sec-Fetch-Mode: cors" \
  -H "Sec-Fetch-Site: same-origin" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 OPR/131.0.0.0" \
  -H "X-Requested-With: XMLHttpRequest" \
  --data-raw "DeliveryID=2&JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg2MzgzMjIsImlzcyI6IlNlbWlqb2lhcyIsImV4cCI6MTc3ODYzODQ0MiwiZGF0YSI6eyJTb3VyY2UiOiJ2aXJ0dWFsY2F0YWxvZ1wvZGVsaXZlcnktbGFiZWwifX0%3D.HlpCBfJSyHe3fWYeRaDG6WcCk5%2BpP8Oi4gPFNM58wUs%3D&Path=virtualcatalog%2Fdelivery-label"
```
