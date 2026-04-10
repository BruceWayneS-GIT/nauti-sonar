import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST() {
  const teamMembers = [
    { name: 'Bruce', email: 'bruce@nautilusmarketing.digital', role: 'admin' },
    { name: 'Elke', email: 'elke@nautilusmarketing.digital', role: 'member' },
    { name: 'Tom', email: 'tom@nautilusmarketing.digital', role: 'member' },
    { name: 'Cam', email: 'cam@nautilusmarketing.digital', role: 'member' },
  ];

  const users = [];
  for (const member of teamMembers) {
    const user = await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role },
      create: member,
    });
    users.push(user);
  }

  return NextResponse.json({ message: `Seeded ${users.length} users`, users });
}
