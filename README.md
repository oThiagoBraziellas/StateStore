# StateStore

Implementação própria de um gerenciador de estado no estilo Redux (reducers, `combineReducers`, middleware, enhancers e seletores memoizados) com um depurador de viagem no tempo (time-travel debugger) que se pluga como enhancer. A página de demonstração usa tudo isso em um app com contador, lista de tarefas e uma chamada assíncrona via thunk.

Nenhuma dependência: a biblioteca tem cerca de 300 linhas de código e 43 testes.

## Por que este projeto

Redux, Zustand, Vuex e NgRx giram em torno das mesmas ideias: estado único e imutável, mudanças descritas por ações e reducers puros. Reimplementá-las é um dos exercícios mais reveladores para entrevistas de front-end sênior, porque obriga a entender o que as bibliotecas fazem por baixo. O projeto cobre:

- `createStore` com as garantias que a biblioteca real dá (reducers não podem despachar nem ler o estado, notificações usam um snapshot dos assinantes, `unsubscribe` idempotente);
- composição de funções (`compose`) e a assinatura de middleware `store => next => action`;
- memoização por identidade de referência, que só funciona porque o estado é imutável;
- enhancers: o depurador envolve o reducer e "levanta" o estado, o mesmo mecanismo do Redux DevTools;
- testes de comportamento de uma biblioteca (casos de borda, reentrância, erros).

## Recursos

**Biblioteca (`src/`)**

- `createStore`, `combineReducers` (preserva a referência quando nada muda), `compose`, `applyMiddleware`, `bindActionCreators`, `replaceReducer`.
- Middlewares: `thunk` (com argumento extra), `logger`, `crashReporter`, `throttle`.
- `createSelector` memoizado com contador de recálculos.
- Depurador de viagem no tempo: registrar, pular para qualquer ponto, pular ações (skip) com recálculo do futuro, pausar, reiniciar, fazer commit do estado atual como nova base, exportar e importar sessões, e reexecutar o histórico quando o reducer é trocado (hot reload).

**Interface de demonstração**

- Contador, lista de tarefas com filtro e uma ação assíncrona que falha de vez em quando (simulado).
- Painel do depurador com lista de ações, controle deslizante, passo a passo, "Replay" animado, diff de cada ação e visualização do estado em JSON.

## Como executar

Abra o `index.html` no navegador ou use um servidor local:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

Se o navegador bloquear ES modules em `file://`, use o servidor local. Dica: adicione algumas tarefas, clique em ações antigas no painel da direita e use "Skip" para ver o estado ser recalculado sem aquela ação.

## Como testar

Dentro desta pasta, com Node 18 ou superior:

```bash
node --test
```

Os 43 testes cobrem: inicialização e despacho; ações inválidas; assinantes adicionados e removidos durante a notificação; proibição de despachar dentro de reducers; `combineReducers` (identidade, `undefined`); ordem de execução dos middlewares, curto-circuito e despacho reentrante; thunk, logger, crashReporter e throttle; memoização dos seletores; diff de estado; e todo o depurador (viagem, skip, erros de reducer, commit, pausa, exportação/importação, hot reload e integração com thunk).

## Decisões de projeto

- **Ações são objetos simples.** Funções e promises só entram via middleware, como no Redux. Isso mantém o log de ações serializável, requisito para exportar e reexecutar sessões.
- **Notificação com snapshot.** Os assinantes são copiados antes de notificar, então quem se inscreve ou sai durante a notificação só afeta o próximo despacho. Evita bugs sutis de iteração.
- **`combineReducers` preserva referência.** Se nenhuma fatia mudou, devolve o mesmo objeto, de modo que `===` basta para detectar mudanças e os seletores memoizados funcionam. O custo é O(k) por ação, com k fatias.
- **Depurador como reducer "levantado".** O estado real fica dentro de `{ initialState, entries, currentIndex }`. Cada entrada guarda a ação e o estado resultante, então pular para um ponto é O(1) e pular uma ação recalcula só do ponto em diante, O(n). A memória cresce com o número de ações, razão pela qual há "Commit" e "Reset".
- **Despachar depois de voltar no tempo descarta o futuro.** É a escolha mais simples e previsível (como o histórico de um editor); o Redux DevTools real oferece outras políticas.
- **Erros de reducer são capturados por entrada.** O estado fica no valor anterior e a ação aparece marcada como erro no painel, em vez de derrubar o app.
- **Ordem dos enhancers.** `compose(applyMiddleware(thunk), devtools.enhancer)` coloca o depurador mais perto do store, de modo que as ações que os thunks despacham também são gravadas.
- **Seletores por identidade.** `createSelector` compara as entradas com `Object.is`, sem comparação profunda, o que é barato e correto com dados imutáveis.

## Estrutura de pastas

```
StateStore/
├── index.html
├── style.css
├── src/
│   ├── store.js        # createStore, combineReducers, compose, applyMiddleware
│   ├── middleware.js   # thunk, logger, crashReporter, throttle
│   ├── selectors.js    # createSelector memoizado
│   ├── devtools.js     # enhancer de viagem no tempo
│   ├── diff.js         # diff estrutural de estados
│   ├── demo-store.js   # reducers, ações, thunk e seletores da demo
│   └── app.js          # interface da demo e do depurador
├── tests/
├── package.json
├── LICENSE
└── README.md
```

## Limitações conhecidas

- Não há integração com frameworks (equivalente ao `react-redux`); a interface da demo assina o store diretamente e re-renderiza por completo.
- O depurador guarda um snapshot por ação (compartilhando estrutura graças à imutabilidade), mas não limita o tamanho do histórico.
- A pausa do depurador é simplificada: o estado novo substitui o do cursor e é descartado em um recálculo posterior.
- Sem suporte a ações assíncronas além de thunks (não há saga nem observables).
- Importar uma sessão exige que os reducers atuais entendam as ações exportadas.
- `app.js` e `demo-store.js` (a parte de DOM) não têm testes de interface; a lógica do store, dos middlewares, dos seletores e do depurador está coberta.

## Licença

MIT. Veja o arquivo [LICENSE](LICENSE).
