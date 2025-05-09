export const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return {
        text: 'text-destructive',
        bg: 'bg-destructive',
        bgOpacity: 'bg-opacity-20',
        fillOpacity: 'fill-opacity-70',
        border: 'border-destructive'
      };
    case 'high':
      return {
        text: 'text-red-500',
        bg: 'bg-red-700',
        bgOpacity: 'bg-opacity-20',
        fillOpacity: 'fill-opacity-70',
        border: 'border-red-700'
      };
    case 'medium':
      return {
        text: 'text-orange-500',
        bg: 'bg-orange-700',
        bgOpacity: 'bg-opacity-20',
        fillOpacity: 'fill-opacity-70',
        border: 'border-orange-500'
      };
    case 'low':
      return {
        text: 'text-green-500',
        bg: 'bg-green-900',
        bgOpacity: 'bg-opacity-20',
        fillOpacity: 'fill-opacity-70',
        border: 'border-green-500'
      };
    default:
      return {
        text: 'text-blue-500',
        bg: 'bg-blue-900',
        bgOpacity: 'bg-opacity-20',
        fillOpacity: 'fill-opacity-70',
        border: 'border-blue-500'
      };
  }
};

export const getSeverityBadge = (severity: string) => {
  const colors = getSeverityColor(severity);
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.bgOpacity} ${colors.text}`;
};

export const getStatusBadge = (status: string) => {
  switch (status) {
    case 'new':
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary bg-opacity-20 text-primary';
    case 'in_progress':
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-700 bg-opacity-20 text-yellow-500';
    case 'resolved':
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 bg-opacity-20 text-green-500';
    case 'acknowledged':
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-700 bg-opacity-20 text-purple-400';
    case 'closed':
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 bg-opacity-20 text-gray-400';
    default:
      return 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 bg-opacity-20 text-gray-400';
  }
};

export const formatTimeAgo = (date: Date | string) => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - parsedDate.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hours ago`;
  
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} days ago`;
};
