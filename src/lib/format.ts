export const formatDuration = (milliseconds: number) => {
  if (milliseconds <= 0) return 'Calculating';
  const minutes = Math.max(1, Math.ceil(milliseconds / 60000));
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `About ${hours}h${remainder ? ` ${remainder}m` : ''}`;
};

export const shortDate = (value?: string) => value
  ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : '—';

export const humanStatus = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export const statusTone = (status: string) => {
  if (['UPLOADED', 'COMPLETED'].includes(status)) return 'status-success';
  if (['FAILED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'].includes(status)) return 'status-danger';
  if (['SUCCESS', 'REVIEW_REQUIRED', 'PAUSED', 'DRAFT'].includes(status)) return 'status-warning';
  if (['GENERATING', 'RUNNING', 'UPLOADING', 'QUEUED', 'UPLOAD_QUEUED'].includes(status)) return 'status-active';
  return 'status-neutral';
};
