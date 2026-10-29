/**
 * Combined Worker Runner for Docker & Background Processing
 * Runs post publishing worker, comment seeding worker, and AI queue worker
 */
require('./post.worker');
require('./comment.worker');

console.log('🚀 [Workers] All background workers (Post & Comment Seeding) are active and listening.');
