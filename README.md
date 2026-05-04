# PhotoChat

App mobile minimalista (Expo / React Native) que tira uma foto, envia diretamente para a API da Anthropic em um chat novo (sem histórico) e mostra a resposta na tela. Swipe lateral abre a câmera novamente.

## Fluxo

1. Tela inicial com ícone de câmera → toque para abrir a câmera.
2. Toque no botão branco do obturador → tira a foto.
3. A foto é enviada como uma nova requisição (`/v1/messages`) para a Anthropic com o prompt:
   > responda a questao da imagem. Nao precisa de longas explicacoes, somente diga qual ou quais as alternativas corretas
4. A resposta aparece na tela.
5. Arraste para o lado (ou toque no FAB azul) para tirar uma nova foto. Cada envio é independente — nenhum contexto é mantido.

## Configuração

```bash
npm install
cp .env.example .env
# edite .env e coloque sua chave real:
# EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠️ **Atenção de segurança:** variáveis `EXPO_PUBLIC_*` são embutidas no bundle do app. Qualquer pessoa com acesso ao APK/IPA pode extrair sua chave. Para uso pessoal/desenvolvimento isso é OK, mas para distribuição use um backend proxy.

## Rodando

```bash
npx expo start
```

Abra com o app **Expo Go** (Android/iOS) ou rode em um simulador. Como o app usa a câmera nativa, prefira testar em um dispositivo físico.

### Testando no navegador

```bash
npx expo start --web
```

O app já manda o header `anthropic-dangerous-direct-browser-access: true` para contornar o CORS. **Use só em desenvolvimento** — sua chave fica exposta no bundle do browser e qualquer um pode inspecionar/usar. Para produção, sempre proxy via backend.

## Arquivos principais

- `App.js` — toda a UI e lógica (4 estados: home / camera / loading / result|error)
- `app.json` — configuração Expo + permissões de câmera
- `.env` — sua chave da Anthropic (não commitada)

## Modelo

Por padrão usa `claude-sonnet-4-6`. Para trocar, edite a constante `ANTHROPIC_MODEL` em `App.js`.
