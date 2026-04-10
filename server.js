const path = require('path');

process.chdir(__dirname);
process.env.NODE_ENV = 'production';

// Passenger sets the PORT via the 'passenger' binding
// Next.js reads process.argv for the command
process.argv = [process.argv[0], 'start', '-p', process.env.PORT || '3000'];

require(path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next'));
