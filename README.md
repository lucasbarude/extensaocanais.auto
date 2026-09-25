# Canais 🔔

Never miss a stream again! Extensão open-source (Manifest V3) que monitora canais do YouTube **e da Twitch** e te avisa — ou abre a aba automaticamente — quando eles entram ao vivo.

## Como testar (modo desenvolvedor)

1. Extraia esta pasta.
2. Abra `chrome://extensions`.
3. Ative **"Modo do desenvolvedor"**.
4. **"Carregar sem compactação"** → selecione a pasta `streambell`.
5. Se você já tinha uma versão anterior carregada: clique no ícone de **recarregar (🔄)** no card do Canais depois de qualquer atualização de código — senão o Chrome continua rodando a versão antiga do `background.js` em cache.

## O que tem nessa versão (v1.2.1)

- Abas separadas **YouTube** / **Twitch** no popup
- Intervalo de checagem configurável (padrão 5 min)
- Badge no ícone com o número de canais ao vivo agora
- Pausar/retomar monitoramento por canal
- Notificar / Abrir automaticamente configuráveis e editáveis por canal (ícones 🔔 / ↗️ na própria linha)
- Tempo de live aberta ("Em live há Xh Ym")

### Correções desta rodada
- **Twitch travava em "ao vivo" pra sempre**: a checagem usava `html.includes('isLiveBroadcast')`, que dá `true` mesmo com o canal offline (o campo existe na página com valor `false`). Corrigido para checar o valor de verdade via regex.
- **Badge não aparecia**: a chamada que atualiza o número no ícone tinha sido removida do fim do ciclo de checagem. Adicionada de volta.
- **Clique na notificação quebrava com nomes de canal com hífen**: trocado o parsing por `split("-")` por um mapa salvo no `storage`.

## Debug

Se algo parar de funcionar depois de editar o código:
1. `chrome://extensions` → clique em **"service worker"** no card do Canais → abre o DevTools do background. Erros de `fetch`/regex aparecem no console ali.
2. Confirme que clicou em **recarregar (🔄)** depois da última edição.
3. Use o botão **"Verificar agora"** no popup pra forçar uma checagem sem esperar o alarme.

## Licença

MIT.
