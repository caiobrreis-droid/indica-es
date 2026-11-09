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

## Login e usuários

O sistema só abre depois do login. O administrador master entra com o usuário e a senha definidos nas variáveis do Railway e, pelo botão **Usuários**, cadastra a equipe:

- **Usuário**: só gera indicações.
- **Administrador**: também cadastra, remove e redefine a senha de outros usuários.

Cada pessoa pode trocar a própria senha em **Minha senha**. As senhas ficam guardadas com hash (scrypt), nunca em texto.

### Variáveis no Railway

| Variável | Para que serve |
|---|---|
| `ADMIN_PASSWORD` | Senha do administrador master. **Obrigatória.** |
| `ADMIN_USER` | Login do master (padrão: `caio`) |
| `ADMIN_NAME` | Nome exibido do master (padrão: `Caio Reis`) |
| `SESSION_SECRET` | Chave que assina o login. Recomendado: um texto aleatório longo |

Os usuários ficam no arquivo `users.json`. No Railway, crie um **volume** no serviço (por exemplo em `/data`); o sistema usa o volume sozinho. Sem volume, os usuários cadastrados somem a cada novo deploy.

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
| `app-auth.js` | Barra do usuário, troca de senha e cadastro de usuários |
| `indicacoes-assets.js` | Imagens do papel timbrado e do selo do vereador |
| `exemplo-indicacao-gerada.png` | Exemplo de indicação gerada |

Cada documento gerado inclui o timbrado, o texto padrão do art. 110, IX do Regimento Interno, a indicação, a foto da rua com o selo e a placa, a justificativa, a data e a linha de assinatura. A assinatura digital continua sendo feita depois, no sistema da Câmara.
