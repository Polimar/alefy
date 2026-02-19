import { AlertTriangle, X } from 'lucide-react';

export default function RateLimitModal({ minutesRemaining, onClose }) {
  const mins = Math.ceil(minutesRemaining);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content rate-limit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rate-limit-icon">
          <AlertTriangle size={48} />
        </div>
        <h2>Limite download raggiunto</h2>
        <p>
          Hai superato il numero massimo di download consentiti per ora.
          {mins > 0 ? (
            <> Riprova tra circa <strong>{mins} {mins === 1 ? 'minuto' : 'minuti'}</strong>.</>
          ) : (
            <> Riprova tra pochi istanti.</>
          )}
        </p>
        <button className="btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
