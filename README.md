# Gerador de Indicações

Sistema para montar as indicações do Gabinete do Vereador Júlio Cézar Medeiros Lima (Câmara Municipal de Boa Vista) de forma rápida, sem precisar copiar e editar um arquivo Word para cada pedido.

![Exemplo de indicação gerada](exemplo-indicacao-gerada.png)

## Como usar

1. Entre no site com o usuário e a senha que o administrador cadastrou.
2. **Ruas:** informe a rua e o bairro e adicione uma foto da rua. Dá para cadastrar várias ruas.
3. **Serviços:** marque o que será pedido: calçada, meio-fio e sarjeta, tapa-buraco, iluminação etc. Também dá para cadastrar serviços novos.
4. O sistema monta uma indicação para cada combinação de rua e serviço. Se precisar, ajuste o texto de qualquer uma antes de baixar.
5. Baixe tudo de uma vez com **Baixar todas em Word (.zip)** ou **Baixar todas em PDF (.zip)**. Também dá para baixar uma indicação de cada vez.

A data, a justificativa e os nomes do prefeito, do presidente da Câmara e do vereador podem ser alterados na seção **3. Documento**. O navegador guarda essas escolhas.

## Envio em lote ao SAPL

Depois de assinar os PDFs com o token do vereador, o botão **📤 Enviar ao SAPL** (ao lado de "Baixar todas em PDF") explica como enviar todos de uma vez:

1. Só na primeira vez: arraste o botão **📤 Enviar ao SAPL** da janela para a barra de favoritos do navegador.
2. Abra o SAPL, entre com o usuário do vereador e clique no favorito. Abre um painel por cima do SAPL.
3. Escolha os PDFs assinados. A ementa de cada um é lida do próprio PDF (o trecho "QUE A PREFEITURA..."); confira e corrija se precisar.
4. **Salvar e enviar**: para cada PDF, o painel faz o mesmo que os botões "Salvar" e "Enviar" do SAPL, um depois do outro, e mostra o número de cada proposição.

O painel (`sapl-lote.js`) roda dentro do SAPL com o login que já está aberto: senha e token não passam pelo Gerador. Ele lembra, no navegador, quais arquivos já foram enviados e pula os repetidos. O endereço do SAPL de cada gabinete fica em **Configurações**.

## Gabinetes, login e usuários

O sistema atende vários gabinetes numa hospedagem só. Cada gabinete tem o próprio papel timbrado, selo, textos e equipe, e um gabinete nunca vê os dados de outro.

- **Master** (você): entra com o usuário e a senha das variáveis do Railway. Em **Gabinetes**, cria cada gabinete junto com o login do administrador dele, e pode bloquear, desbloquear ou excluir gabinetes. Pelo seletor no topo, abre qualquer gabinete.
- **Administrador do gabinete** (o vereador): em **Configurações**, envia o papel timbrado (imagem da folha A4 inteira) e o selo da foto, e preenche vereador, prefeito, presidente da Câmara, município, UF, artigo do Regimento Interno e justificativa padrão. Em **Usuários**, cadastra os assessores.
- **Assessor**: só gera indicações, no timbrado do próprio gabinete.

Gabinete bloqueado: ninguém dele consegue entrar até o master desbloquear.

Cada pessoa pode trocar a própria senha em **Minha senha**. As senhas ficam guardadas com hash (scrypt), nunca em texto.

Na primeira vez que o servidor sobe, ele cria sozinho o gabinete do Vereador Júlio Cézar Medeiros Lima com o timbrado e o selo de `indicacoes-assets.js`.

### Variáveis no Railway

| Variável | Para que serve |
|---|---|
| `ADMIN_PASSWORD` | Senha do administrador master. **Obrigatória.** |
| `ADMIN_USER` | Login do master (padrão: `caio`) |
| `ADMIN_NAME` | Nome exibido do master (padrão: `Caio Reis`) |
| `SESSION_SECRET` | Chave que assina o login. Recomendado: um texto aleatório longo |

Usuários, gabinetes e imagens ficam na pasta de dados (`users.json`, `gabinetes.json` e `gabinetes/`). No Railway, crie um **volume** no serviço (por exemplo em `/data`); o sistema usa o volume sozinho. Sem volume, os usuários cadastrados somem a cada novo deploy.

### Rodar no computador

```
npm start
```

Abre em http://localhost:3000. Sem `ADMIN_PASSWORD`, o servidor cria uma senha para o master e mostra no terminal.

## Arquivos

| Arquivo | O que é |
|---|---|
| `server.js` | Servidor: login, usuários e entrega das páginas (sem dependências externas) |
| `login.html` | Tela de login |
| `index.html` | O gerador |
| `sapl-lote.js` | Painel de envio em lote que roda dentro do SAPL (público, sem dados) |
| `app-auth.js` | Barra do usuário, gabinetes, configurações, troca de senha e cadastro de usuários |
| `indicacoes-assets.js` | Timbrado e selo originais do gabinete do Júlio Cézar, usados só para criar o primeiro gabinete |
| `exemplo-indicacao-gerada.png` | Exemplo de indicação gerada |

Cada documento gerado inclui o timbrado, o texto padrão do art. 110, IX do Regimento Interno, a indicação, a foto da rua com o selo e a placa, a justificativa, a data e a linha de assinatura. A assinatura digital continua sendo feita depois, no sistema da Câmara.
