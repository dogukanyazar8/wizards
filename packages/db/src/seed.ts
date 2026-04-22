import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create demo user
  const passwordHash = await bcrypt.hash('password123', 12)
  
  const user = await prisma.user.upsert({
    where: { email: 'demo@wizards.app' },
    update: {},
    create: {
      email: 'demo@wizards.app',
      username: 'wizard',
      displayName: 'The Wizard',
      passwordHash,
      emailVerified: true,
      settings: { create: {} },
      notificationSettings: { create: {} },
    },
  })

  // Create second demo user
  const user2 = await prisma.user.upsert({
    where: { email: 'test@wizards.app' },
    update: {},
    create: {
      email: 'test@wizards.app',
      username: 'testuser',
      displayName: 'Test User',
      passwordHash,
      emailVerified: true,
      settings: { create: {} },
      notificationSettings: { create: {} },
    },
  })

  // Create demo server
  const server = await prisma.server.upsert({
    where: { inviteCode: 'WIZARDS1' },
    update: {},
    create: {
      name: 'Wizards HQ',
      ownerId: user.id,
      inviteCode: 'WIZARDS1',
      isPublic: true,
    },
  })

  // Create default role (@everyone)
  await prisma.role.upsert({
    where: { id: 'everyone-' + server.id },
    update: {},
    create: {
      id: 'everyone-' + server.id,
      serverId: server.id,
      name: '@everyone',
      position: 0,
      isDefault: true,
      permissions: BigInt(0),
    },
  })

  // Add owner as member
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: user.id, serverId: server.id } },
    update: {},
    create: {
      userId: user.id,
      serverId: server.id,
    },
  })

  // Add second user as member
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: user2.id, serverId: server.id } },
    update: {},
    create: {
      userId: user2.id,
      serverId: server.id,
    },
  })

  // Create default category
  const category = await prisma.channelCategory.create({
    data: {
      serverId: server.id,
      name: 'General',
      position: 0,
    },
  })

  // Create #general text channel
  await prisma.channel.create({
    data: {
      serverId: server.id,
      categoryId: category.id,
      name: 'general',
      type: 'TEXT',
      position: 0,
      topic: 'Welcome to Wizards HQ!',
    },
  })

  // Create General voice channel
  await prisma.channel.create({
    data: {
      serverId: server.id,
      categoryId: category.id,
      name: 'General',
      type: 'VOICE',
      position: 1,
    },
  })

  console.log('✅ Seed complete')
  console.log('📧 Demo user: demo@wizards.app / password123')
  console.log('📧 Test user: test@wizards.app / password123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
