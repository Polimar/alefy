import { useState } from 'react';
import usePlayerStore from '../store/playerStore';
import { X, Play, Music, GripVertical } from 'lucide-react';
import './QueuePanel.css';

export default function QueuePanel() {
  const { queue, currentTrack, showQueue, setCurrentTrack, play, toggleQueue, removeFromQueue, setQueue } = usePlayerStore();
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  if (!showQueue) return null;

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newQueue = [...queue];
    const [removed] = newQueue.splice(draggedIndex, 1);
    newQueue.splice(dropIndex, 0, removed);

    // Aggiorna queue nello store
    setQueue(newQueue);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handlePlayTrack = (track) => {
    setCurrentTrack(track);
    play();
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`queue-panel ${showQueue ? 'show' : ''}`}>
      <div className="queue-header">
        <h3>Coda di riproduzione</h3>
        <button onClick={toggleQueue} className="queue-close-btn">
          <X size={20} />
        </button>
      </div>
      <div className="queue-content">
        {queue.length === 0 ? (
          <div className="queue-empty">
            <Music size={48} />
            <p>Nessun brano in coda</p>
          </div>
        ) : (
          <div className="queue-list">
            {queue.map((track, index) => {
              const isCurrent = currentTrack?.id === track.id;
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={`${track.id}-${index}`}
                  className={`queue-item ${isCurrent ? 'current' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="queue-item-drag-handle">
                    <GripVertical size={16} />
                  </div>
                  <div className="queue-item-number">{index + 1}</div>
                  <div className="queue-item-info" onClick={() => handlePlayTrack(track)}>
                    <div className="queue-item-title">{track.title || 'Titolo sconosciuto'}</div>
                    <div className="queue-item-artist">{track.artist || 'Artista sconosciuto'}</div>
                  </div>
                  <div className="queue-item-duration">{formatDuration(track.duration)}</div>
                  <button
                    className="queue-item-play"
                    onClick={() => handlePlayTrack(track)}
                    title="Riproduci"
                  >
                    <Play size={16} />
                  </button>
                  <button
                    className="queue-item-remove"
                    onClick={() => removeFromQueue(track.id)}
                    title="Rimuovi"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

