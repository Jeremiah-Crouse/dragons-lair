// Simple user info for coloring
export const getUserInfo = () => {
  // For now, just differentiate admin and visitor
  const isAdmin = window.location.hostname.startsWith('admin');
  return {
    name: isAdmin ? 'Admin' : 'Visitor',
    color: isAdmin ? '#FFD700' : '#00FF88', // gold vs green
    isAdmin
  };
};
