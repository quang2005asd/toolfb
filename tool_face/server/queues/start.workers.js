/**
 * Combined Worker Runner for Docker & Background Processing
 * Runs post publishing worker, comment seeding worker, AI queue worker, and auth log worker
 */
require('./post.worker');
require('./comment.worker');
require('./authlog.worker');

console.log('🚀 [Workers] All background workers (Post, Comment Seeding & Auth Log) are active and listening.');
