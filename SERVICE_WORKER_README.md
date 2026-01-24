# SuporteApp Web 3.7 - Service Worker

## O que é o Service Worker?

O arquivo `sw.js` é um Service Worker que melhora a experiência do SuporteApp Web de duas formas:

### 1. **Cache Offline** 📦

- Permite que o app funcione mesmo sem internet
- Carrega mais rápido após a primeira visita
- Armazena os arquivos principais em cache

### 2. **Shortcuts do PWA** 🚀

- Permite que o atalho "Abrir no modo compacto" funcione mesmo com o Chrome fechado
- Intercepta a navegação e garante que o modo popup seja ativado corretamente

## Arquivos Necessários

Para o app funcionar completamente, você precisa ter na mesma pasta:

```
📁 SuporteApp Web 3.7/
├── index.html          (arquivo principal)
├── manifest.json       (configuração do PWA)
├── sw.js              (Service Worker - NOVO!)
├── favicon.png        (ícone do app)
└── texts.json         (seus textos/scripts)
```

## Como Funciona?

1. Quando você abre o `index.html` pela primeira vez, o Service Worker é registrado automaticamente
2. Ele baixa e armazena em cache os arquivos principais
3. Quando você usa o shortcut "Abrir no modo compacto", o Service Worker intercepta e garante que funcione corretamente

## Atualizações

Quando você atualizar o app:

1. O Service Worker detecta automaticamente a nova versão
2. Mostra uma notificação: "Nova versão disponível! Recarregue a página."
3. Basta recarregar a página para usar a versão atualizada

## Solução de Problemas

### O shortcut ainda não funciona?

1. Abra o app uma vez no navegador
2. Aguarde alguns segundos para o Service Worker ser registrado
3. Feche o navegador completamente
4. Tente usar o shortcut novamente

### Como limpar o cache e dados do app?

**Método Recomendado (mais fácil e seguro):**

1. **Faça backup primeiro:**
   - Abra Configurações (⚙️)
   - Clique em "📤 Baixar Backup" (salva textos, configurações e anotações)

2. **Limpe tudo:**
   - Pressione `F12` → DevTools
   - Vá em "Application" > "Storage"
   - Clique em "Clear site data"
   - **OU** use o botão "⚠ Resetar Tudo" nas configurações

3. **Restaure seus dados:**
   - Abra Configurações (⚙️)
   - Clique em "� Restaurar Backup"
   - Selecione o arquivo que você baixou

**Pronto!** O Service Worker se registra automaticamente quando você recarregar a página.

> **💡 Nota:** O backup NÃO inclui o Service Worker (ele é recriado automaticamente). Isso é bom, pois garante que você sempre terá a versão mais recente do cache.

---

**Nota**: O Service Worker é um arquivo separado porque é um requisito técnico dos navegadores. Ele roda em segundo plano e não pode ser incorporado no HTML.
