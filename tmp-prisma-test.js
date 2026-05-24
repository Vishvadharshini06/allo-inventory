const {PrismaClient} = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRaw`SELECT 1 AS result`.then(r => { console.log('OK', JSON.stringify(r)); process.exit(0); }).catch(e => { console.error('ERR', e.message); process.exit(1); });
