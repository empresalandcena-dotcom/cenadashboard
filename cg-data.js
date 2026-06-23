/* ═══════════════════════════════════════════════════════
   Loader compartilhado da aba CONTROLE_GERAL (via /api/controle-geral)
   Usado por viabilidade.js, peps.js e encerramento.js
═══════════════════════════════════════════════════════ */

let cgRowsPromise = null;

function cgLoadRows() {
  if (!cgRowsPromise) {
    cgRowsPromise = fetch('/api/controle-geral')
      .then((res) => {
        if (!res.ok) throw new Error(`Falha ao buscar CONTROLE_GERAL: ${res.status}`);
        return res.json();
      })
      .then((data) => data.rows || []);
  }
  return cgRowsPromise;
}

window.cgLoadRows = cgLoadRows;
