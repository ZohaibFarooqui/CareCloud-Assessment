// Two demonstration records so the dashboard and API aren't empty on a fresh database.
// Both are obviously fictional. The brief says not to store real patient data, and 555
// numbers are reserved for exactly this kind of thing.
//
//   npm run db:seed
//
// Safe to run more than once; it skips anyone already on file.

require('dotenv').config();

const { prisma } = require('../src/lib/prisma');

const SEEDS = [
  {
    firstName: 'Maria',
    lastName: 'Alvarez',
    dateOfBirth: new Date(Date.UTC(1984, 6, 22)),
    sex: 'FEMALE',
    phoneNumber: '5045550101',
    addressLine1: '1427 Prytania St',
    addressLine2: 'Apt 3B',
    city: 'New Orleans',
    state: 'LA',
    zipCode: '70130',
    email: 'maria.alvarez@example.com',
    insuranceProvider: 'Blue Cross Blue Shield',
    insuranceMemberId: 'BCBS8842119',
    preferredLanguage: 'Spanish',
    emergencyContactName: 'Rafael Alvarez',
    emergencyContactPhone: '5045550102',
  },
  {
    firstName: 'Desmond',
    lastName: "O'Neill",
    dateOfBirth: new Date(Date.UTC(1971, 10, 9)),
    sex: 'MALE',
    phoneNumber: '5125550143',
    addressLine1: '908 Red River St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701-2245',
    preferredLanguage: 'English',
  },
];

async function main() {
  for (const seed of SEEDS) {
    const existing = await prisma.patient.findFirst({
      where: { phoneNumber: seed.phoneNumber, deletedAt: null },
    });

    if (existing) {
      console.log('skip   ' + seed.firstName + ' ' + seed.lastName + ' (already on file)');
      continue;
    }

    const row = await prisma.patient.create({ data: seed });
    console.log('seeded ' + row.firstName + ' ' + row.lastName + '  ' + row.patientId);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
