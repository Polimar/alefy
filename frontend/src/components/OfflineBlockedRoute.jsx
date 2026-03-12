import { Navigate } from 'react-router-dom';
import useOfflineStore from '../store/offlineStore';

export default function OfflineBlockedRoute({ children }) {
  const isOfflineMode = useOfflineStore((s) => s.isOfflineMode);

  if (isOfflineMode) {
    return <Navigate to="/" replace />;
  }

  return children;
}
