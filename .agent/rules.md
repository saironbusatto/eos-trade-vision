# Regras do Workspace - Projeto EOS

Este arquivo define as diretrizes para a IA (Antigravity) ao trabalhar neste repositório.

## 🇧🇷 Idioma e Comunicação
- Toda a documentação, nomes de classes, comentários de código e mensagens de commit **devem ser em Português Brasileiro**.

## 🛡️ Segurança e Credenciais
- **PROIBIDO** adicionar arquivos de chaves `.pem` ao Git.
- **PROIBIDO** adicionar arquivos `.env` ao Git.
- Sempre verifique o `.gitignore` antes de sugerir novos arquivos.

## 🏗️ Arquitetura e Microserviços
- O projeto é composto por múltiplos serviços. Sempre especifique o contexto ao realizar alterações:
  - `eos-telegram-bot`: Bot principal de cripto.
  - `eos-iq-bot`: Bot de opções binárias/Forex.
  - `eos-gateway`: Ponto central de API.
  - `eos-ml`: Serviços de Machine Learning.
- Use `Bun` ou `NPM` conforme detectado em cada pasta.

## 🚀 Infraestrutura e Deploy
- A infraestrutura oficial está documentada em [INFRASTRUCTURE.md](file:///c:/Users/sairo/Projetos/EOS/docs/INFRASTRUCTURE.md).
- O deploy é automatizado via GitHub Actions nas pastas configuradas.

## 📚 Documentação
- Mantenha o `README.md` da raiz como um portal de acesso fácil para todos os sub-projetos.
- Documente novas funcionalidades no respectivo `README.md` do serviço.
