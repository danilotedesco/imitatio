# Deploy Guide — GitHub Pages + Render

Este guia explica como fazer deploy do app para GitHub Pages (frontend) e Render (backend).

## Passo 1: Preparar o GitHub

### 1.1 Criar um repositório no GitHub

1. Vá para [GitHub](https://github.com) e crie um novo repositório público
   - Nome sugerido: `imitatio`
   - **NÃO** inicialize com README (você já tem um)

2. Clone o repositório localmente:
```bash
git clone https://github.com/SEU_USERNAME/imitatio.git
```

3. Copie seus arquivos para dentro dele:
```bash
cd imitatio
# Copie todo conteúdo do seu projeto
```

### 1.2 Configurar GitHub Pages

1. Vá para **Settings > Pages**
2. Em "Build and deployment":
   - **Source**: GitHub Actions
   - O workflow já está configurado em `.github/workflows/deploy.yml`

### 1.3 Push para GitHub

```bash
git add .
git commit -m "Initial commit: Latin Audio Flashcards"
git push origin main
```

Pronto! O GitHub Actions começará a fazer build automaticamente. Você pode conferir o status em **Actions**.

**Seu frontend estará disponível em:**
```
https://SEU_USERNAME.github.io/imitatio
```

---

## Passo 2: Deploy do Backend no Render

### 2.1 Criar conta no Render

1. Vá para [render.com](https://render.com) e crie uma conta (use GitHub para simplificar)

### 2.2 Conectar repositório

1. No dashboard do Render, clique em **"New +" > "Web Service"**
2. Selecione **"Deploy existing repository"**
3. Conecte sua conta GitHub se ainda não estiver conectada
4. Selecione seu repositório `imitatio`

### 2.3 Configurar o serviço

Na criação do serviço, configure:

- **Name**: `latin-audio-backend`
- **Runtime**: `Python 3.11`
- **Build Command**: 
  ```
  pip install -r backend/requirements.txt
  ```
- **Start Command**: 
  ```
  cd backend && python app.py
  ```
- **Plan**: `Free` (ou upgrade para melhor performance)

### 2.4 Variáveis de ambiente (opcional)

Se quiser usar Google Cloud TTS ou outras engines:

1. Vá para **Environment** no painel do Render
2. Adicione as variáveis que precisar:
   ```
   PREFERRED_ENG_ENGINE=edge
   ENABLE_GOOGLE_TTS=0
   ```

### 2.5 Obter URL do backend

Após o deploy, você receberá uma URL como:
```
https://latin-audio-backend-abc123.onrender.com
```

---

## Passo 3: Conectar Frontend ao Backend

### 3.1 Atualizar `.env.production`

Edite `vite-app/.env.production` e atualize:

```
VITE_API_URL=https://latin-audio-backend-abc123.onrender.com
```

(Substitua `abc123` pela sua URL real do Render)

### 3.2 Verificar o código do frontend

Certifique-se que seu código React usa `import.meta.env.VITE_API_URL` para fazer requisições:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Exemplo de requisição
async function synthesize(text, language) {
  const response = await fetch(`${API_URL}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language })
  });
  return response.blob();
}
```

### 3.3 Push e redeploy

```bash
git add vite-app/.env.production
git commit -m "Add backend URL for production"
git push origin main
```

GitHub Actions vai fazer rebuild automaticamente com a nova URL.

---

## Desenvolvimento Local

Para desenvolver localmente mantendo tudo sincronizado:

```bash
# Terminal 1: Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py

# Terminal 2: Frontend
cd vite-app
npm install
npm run dev
```

Ou use o script único:
```bash
./dev.sh
```

---

## Troubleshooting

### Frontend não encontra o backend

- Verifique se `VITE_API_URL` está correto em `.env.production`
- Confirme que o backend está rodando no Render (check em **Status**)
- Abra DevTools do browser (F12) e veja os erros no Console

### Backend no Render dá erro

- Vá para **Logs** no dashboard do Render
- Verifique se as dependências em `backend/requirements.txt` são compatíveis
- Se usar Google Cloud TTS, configure `GOOGLE_APPLICATION_CREDENTIALS`

### "CORS error" na requisição

- Backend já tem suporte a CORS (veja `@app.after_request` em `app.py`)
- Se ainda tiver problema, abra issue ou contate suporte

---

## Domínio customizado (opcional)

Se quiser um domínio próprio:

1. **GitHub Pages**: Vá em Settings > Pages > Custom Domain
2. **Render**: Vá em Settings > Custom Domain

---

**Pronto!** Seu app está no ar! 🚀
