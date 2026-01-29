# Push Automatico su GitHub

## Configurazione

Il push automatico è configurato. Per usarlo:

### Metodo 1: Script diretto
```bash
./.git-push.sh
```

### Metodo 2: Alias Git
```bash
git push-auto
```

## Prima configurazione

Se è la prima volta che fai push, GitHub richiederà le credenziali:

1. **Username**: Il tuo username GitHub
2. **Password**: Usa un **Personal Access Token** (non la password)

### Come creare un token GitHub:

1. Vai su: https://github.com/settings/tokens
2. Clicca "Generate new token (classic)"
3. Seleziona gli scope: `repo` (tutti)
4. Genera e copia il token
5. Usa il token come password quando Git lo richiede

### Salvataggio credenziali

Le credenziali vengono salvate automaticamente grazie al `credential.helper` configurato.

## Note

- Lo script committa automaticamente le modifiche non committate
- Se non ci sono modifiche, esegue solo il push
- In caso di errore, mostra istruzioni per la configurazione


