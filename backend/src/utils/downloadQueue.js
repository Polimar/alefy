import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sistema di code per gestire download YouTube multipli
 * Ogni utente ha una coda separata che processa download sequenzialmente
 */

class DownloadQueue extends EventEmitter {
  constructor() {
    super();
    // Map<userId, Array<job>>
    this.queues = new Map();
    // Map<jobId, job>
    this.jobs = new Map();
    // Map<userId, boolean> - indica se c'è un worker attivo per l'utente
    this.processing = new Map();
  }

  /**
   * Aggiunge un job alla coda dell'utente
   */
  addJob(userId, jobData) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      userId,
      url: jobData.url,
      thumbnailUrl: jobData.thumbnailUrl || null,
      status: 'pending',
      progress: 0,
      speed: null,
      eta: null,
      error: null,
      track: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...jobData,
    };

    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
    }

    this.queues.get(userId).push(job);
    this.jobs.set(jobId, job);

    // Avvia il worker se non è già attivo
    this.processQueue(userId);

    return jobId;
  }

  /**
   * Ottiene tutti i job di un utente
   */
  getUserJobs(userId) {
    return this.queues.get(userId) || [];
  }

  /**
   * Ottiene un job specifico
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Aggiorna lo stato di un job
   */
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    Object.assign(job, updates, { updatedAt: new Date() });
    this.emit('job-updated', job);
    return true;
  }

  /**
   * Rimuove un job dalla coda
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const userQueue = this.queues.get(job.userId);
    if (userQueue) {
      const index = userQueue.findIndex(j => j.id === jobId);
      if (index !== -1) {
        userQueue.splice(index, 1);
      }
    }

    this.jobs.delete(jobId);
    this.emit('job-removed', jobId);
    return true;
  }

  /**
   * Processa la coda di un utente sequenzialmente
   */
  async processQueue(userId) {
    // Se c'è già un worker attivo, non fare nulla
    if (this.processing.get(userId)) {
      return;
    }

    const queue = this.queues.get(userId);
    if (!queue || queue.length === 0) {
      this.processing.set(userId, false);
      return;
    }

    // Trova il prossimo job pending (non paused)
    const jobIndex = queue.findIndex(j => j.status === 'pending' || j.status === 'paused');
    if (jobIndex === -1) {
      this.processing.set(userId, false);
      return;
    }

    const job = queue[jobIndex];
    // Se il job è paused, non processarlo
    if (job.status === 'paused') {
      this.processing.set(userId, false);
      return;
    }

    this.processing.set(userId, true);
    const job = queue[jobIndex];

    // Il job verrà processato dal controller che chiamerà updateJob per aggiornare lo stato
    // Quando il job è completato o fallito, questo metodo verrà chiamato di nuovo
    this.emit('job-ready', job);
  }

  /**
   * Mette in pausa un job
   */
  pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Solo job pending possono essere messi in pausa
    if (job.status !== 'pending') {
      return false;
    }

    this.updateJob(jobId, { status: 'paused' });
    
    // Se era in processing, ferma il worker
    if (this.processing.get(job.userId)) {
      this.processing.set(job.userId, false);
    }

    return true;
  }

  /**
   * Riprende un job in pausa
   */
  resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Solo job paused possono essere ripresi
    if (job.status !== 'paused') {
      return false;
    }

    this.updateJob(jobId, { status: 'pending' });
    
    // Riavvia il processing della coda
    this.processQueue(job.userId);

    return true;
  }

  /**
   * Segnala che un job è stato completato o fallito
   */
  jobFinished(userId, jobId) {
    this.processing.set(userId, false);
    // Processa il prossimo job nella coda
    setTimeout(() => this.processQueue(userId), 100);
  }

  /**
   * Pulisce i job completati più vecchi di 5 secondi (per nasconderli subito dalla UI)
   */
  cleanupOldJobs() {
    const fiveSecondsAgo = Date.now() - 5 * 1000;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (
        job.status === 'completed' &&
        job.updatedAt.getTime() < fiveSecondsAgo
      ) {
        this.removeJob(jobId);
      }
    }
  }

  /**
   * Pulisce i job falliti più vecchi di 1 ora
   */
  cleanupFailedJobs() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (
        job.status === 'failed' &&
        job.updatedAt.getTime() < oneHourAgo
      ) {
        this.removeJob(jobId);
      }
    }
  }
}

// Singleton instance
const downloadQueue = new DownloadQueue();

// Cleanup automatico job completati ogni 2 secondi
setInterval(() => {
  downloadQueue.cleanupOldJobs();
}, 2 * 1000);

// Cleanup automatico job falliti ogni 30 minuti
setInterval(() => {
  downloadQueue.cleanupFailedJobs();
}, 30 * 60 * 1000);

export default downloadQueue;

