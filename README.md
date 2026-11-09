# Gerador de Indicações

Sistema para montar as indicações do Gabinete do Vereador Júlio Cézar Medeiros Lima (Câmara Municipal de Boa Vista) de forma rápida, sem precisar copiar e editar um arquivo Word para cada pedido.

![Exemplo de indicação gerada](exemplo-indicacao-gerada.png)

## Como usar

1. Abra o `gerador-indicacoes.html` no Chrome ou no Edge, com dois cliques. É preciso estar conectado à internet.
2. **Ruas:** informe a rua e o bairro e adicione uma foto da rua. Dá para cadastrar várias ruas.
3. **Serviços:** marque o que será pedido: calçada, meio-fio e sarjeta, tapa-buraco, iluminação etc. Também dá para cadastrar serviços novos.
4. O sistema monta uma indicação para cada combinação de rua e serviço. Se precisar, ajuste o texto de qualquer uma antes de baixar.
5. Baixe tudo de uma vez com **Baixar todas em Word (.zip)** ou **Baixar todas em PDF (.zip)**. Também dá para baixar uma indicação de cada vez.

A data, a justificativa e os nomes do prefeito, do presidente da Câmara e do vereador podem ser alterados na seção **3. Documento**. O navegador guarda essas escolhas.

## Arquivos

| Arquivo | O que é |
|---|---|
| `gerador-indicacoes.html` | O sistema |
| `indicacoes-assets.js` | Imagens do papel timbrado e do selo do vereador. Precisa ficar na mesma pasta do `.html` |
| `exemplo-indicacao-gerada.png` | Exemplo de indicação gerada |

Cada documento gerado inclui o timbrado, o texto padrão do art. 110, IX do Regimento Interno, a indicação, a foto da rua com o selo e a placa, a justificativa, a data e a linha de assinatura. A assinatura digital continua sendo feita depois, no sistema da Câmara.
