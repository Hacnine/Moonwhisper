import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/config/database";

// Lightweight seed types to avoid TypeScript inferring narrow literal types
type UserSeed = {
  name: string;
  email: string;
  password: string;
  gender: string;
  role: string;
  // allow both snake_case (as present in the data) and camelCase access
  is_active?: boolean;
  isActive?: boolean;
  bio?: string;
  themeIndex?: number;
  fileSendingAllowed?: boolean;
  notification_settings?: { new_message?: boolean; mention?: boolean; sound?: boolean };
};

type MessageSeed = {
  text: string;
  messageType?: string;
  status?: string;
};

// --- Sample data (trimmed for clarity) ---
const SAMPLE_USERS: UserSeed[] = [
  // Superadmin
  {
    name: "Super Admin",
    email: "superadmin@chatapp.com",
    password: "Admin@123!",
    gender: "male",
    role: "superadmin",
    is_active: true,
    bio: "System Administrator",
    themeIndex: 0,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  // Admins
  {
    name: "Admin Ahmed",
    email: "admin.ahmed@chatapp.com",
    password: "Admin@123!",
    gender: "male",
    role: "admin",
    is_active: true,
    bio: "Platform Administrator",
    themeIndex: 1,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Admin Mike",
    email: "admin.mike@chatapp.com",
    password: "Admin@123!",
    gender: "male",
    role: "admin",
    is_active: true,
    bio: "Content Moderator",
    themeIndex: 2,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  // Moderators
  {
    name: "Moderator Ali",
    email: "mod.ali@chatapp.com",
    password: "Mod@123!",
    gender: "male",
    role: "moderator",
    is_active: true,
    bio: "Community Moderator",
    themeIndex: 3,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Moderator Omar",
    email: "mod.omar@chatapp.com",
    password: "Mod@123!",
    gender: "male",
    role: "moderator",
    is_active: true,
    bio: "Safety Moderator",
    themeIndex: 4,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  // Teachers
  {
    name: "Dr. Johnson",
    email: "dr.johnson@university.edu",
    password: "Teacher@123!",
    gender: "male",
    role: "teacher",
    is_active: true,
    bio: "Professor of Computer Science",
    themeIndex: 0,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Prof. Muhammad",
    email: "prof.muhammad@university.edu",
    password: "Teacher@123!",
    gender: "male",
    role: "teacher",
    is_active: true,
    bio: "Mathematics Professor",
    themeIndex: 1,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Mr. Hassan",
    email: "mr.hassan@university.edu",
    password: "Teacher@123!",
    gender: "male",
    role: "teacher",
    is_active: true,
    bio: "English Literature Teacher",
    themeIndex: 2,
    fileSendingAllowed: true,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  // Students
  {
    name: "Ahmed Chen",
    email: "ahmed.chen@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Computer Science Student",
    themeIndex: 3,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Bob Wilson",
    email: "bob.wilson@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Mathematics Major",
    themeIndex: 4,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Charlie Brown",
    email: "charlie.brown@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Engineering Student",
    themeIndex: 0,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Hassan Prince",
    email: "hassan.prince@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Literature Student",
    themeIndex: 1,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Ethan Hunt",
    email: "ethan.hunt@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Business Administration",
    themeIndex: 2,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Ismail Green",
    email: "ismail.green@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Art History Student",
    themeIndex: 3,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "George Lucas",
    email: "george.lucas@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Film Studies",
    themeIndex: 4,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
  {
    name: "Hussein Montana",
    email: "hussein.montana@student.edu",
    password: "Student@123!",
    gender: "male",
    role: "user",
    is_active: true,
    bio: "Music Performance",
    themeIndex: 0,
    fileSendingAllowed: false,
    notification_settings: { new_message: true, mention: true, sound: true },
  },
];
const SAMPLE_CONVERSATIONS = [
  // Private conversations
  {
    type: "private",
    participants: [], // Will be filled with user IDs
    status: "accepted",
    visibility: "private",
  },
  {
    type: "private",
    participants: [], // Will be filled with user IDs
    status: "accepted",
    visibility: "private",
  },
  // Groups
  {
    type: "group",
    participants: [], // Will be filled with user IDs
    status: "accepted",
    visibility: "public",
    group: {
      is_group: true,
      type: "group",
      name: "Study Group Alpha",
      intro: "Advanced Computer Science Study Group",
      admins: [], // Will be filled with user IDs
      fileSendingAllowed: true,
    },
  },
  {
    type: "group",
    participants: [], // Will be filled with user IDs
    status: "accepted",
    visibility: "private",
    group: {
      is_group: true,
      type: "group",
      name: "Math Helpers",
      intro: "Get help with mathematics problems",
      admins: [], // Will be filled with user IDs
      fileSendingAllowed: false,
    },
  },
  // Classrooms removed
];

const SAMPLE_MESSAGES: MessageSeed[] = [
  {
    text: "Hello everyone! Welcome to the class.",
    messageType: "text",
    status: "delivered",
  },
  {
    text: "Hi! I'm excited to learn programming.",
    messageType: "text",
    status: "delivered",
  },
  {
    text: "Can someone help me with this math problem?",
    messageType: "text",
    status: "delivered",
  },
  {
    text: "Here's the assignment file",
    messageType: "file",
    status: "delivered",
  },
  {
    text: "Check out this diagram",
    messageType: "image",
    status: "delivered",
  },
];

const SAMPLE_QUICK_LESSONS = [
  {
    lessonName: "Introduction to Variables",
    lessonParts: [
      "Variables are containers for storing data values.",
      "In Python, you create a variable by assigning a value: x = 5",
      "Variable names must start with a letter or underscore.",
      "Python has no command for declaring a variable.",
    ],
  },
  {
    lessonName: "Basic Calculus Concepts",
    lessonParts: [
      "Limits describe the behavior of a function as it approaches a value.",
      "Derivatives measure the rate of change of a function.",
      "The fundamental theorem connects differentiation and integration.",
      "Integration finds the area under a curve.",
    ],
  },
  {
    lessonName: "Shakespeare's Sonnets",
    lessonParts: [
      "Shakespeare wrote 154 sonnets in his lifetime.",
      "Sonnets follow a specific rhyme scheme: ABAB CDCD EFEF GG",
      "They explore themes of love, beauty, and time.",
      "Sonnet 18 compares the beloved to a summer's day.",
    ],
  },
];


// --- DB helpers ---
const connectDatabase = async () => {
  console.log("🔌 Connecting to database (Prisma)...");
  await prisma.$connect();
  console.log("✅ Connected to database");
};

const disconnectDatabase = async () => {
  await prisma.$disconnect();
  console.log("🔌 Disconnected Prisma client");
};

const hasUsers = async () => {
  const count = await prisma.user.count();
  return count > 0;
};

// CLI flags
const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force") || ARGS.includes("-f");

// --- Create users ---
const createUsers = async () => {
  console.log("👥 Creating users with Prisma...");
  const created: any[] = [];

  for (const u of SAMPLE_USERS) {
    const hashed = await bcrypt.hash(u.password, 10);
    const data: any = {
      name: u.name,
      email: u.email,
      password: hashed,
      gender: u.gender,
      role: u.role,
      isActive: u.is_active ?? u.isActive ?? false,
      bio: u.bio,
      themeIndex: u.themeIndex ?? 0,
      fileSendingAllowed: u.fileSendingAllowed ?? false,
      notifNewMessage: u.notification_settings?.new_message ?? true,
      notifMention: u.notification_settings?.mention ?? true,
      notifSound: u.notification_settings?.sound ?? true,
    };
    // Use upsert to make seed idempotent and avoid duplicate-unique errors
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: data,
      create: data,
    });
    created.push(user);
    console.log(`   ✅ Created user: ${user.name} (${user.role})`);
  }

  console.log(`✅ Created ${created.length} users`);
  return created;
};

// --- Create conversations and participants ---
const createConversations = async (users: any[]) => {
  console.log("💬 Creating conversations and participants...");
  const students = users.filter((u) => u.role === "user");
  const teachers = users.filter((u) => u.role === "teacher");
  const admins = users.filter(
    (u) => u.role === "admin" || u.role === "superadmin",
  );

  const createdConversations: any[] = [];

  // Private conversation between two students
  const conv1 = await prisma.conversation.create({
    data: {
      status: "accepted",
      visibility: "private",
      isGroup: false,
      participants: {
        create: [{ userId: students[0].id }, { userId: students[1].id }],
      },
    },
    include: { participants: true },
  });
  createdConversations.push(conv1);

  // Public group
  const conv2 = await prisma.conversation.create({
    data: {
      status: "accepted",
      visibility: "public",
      isGroup: true,
      groupType: "group",
      groupName: "Study Group Alpha",
      groupIntro: "Advanced Computer Science Study Group",
      fileSendingAllowed: true,
      participants: {
        create: [
          { userId: teachers[0]?.id },
          { userId: students[0].id },
          { userId: students[1].id },
        ],
      },
      admins: { create: [{ userId: teachers[0]?.id }] },
    },
    include: { participants: true, admins: true },
  });
  createdConversations.push(conv2);

  // Classroom conversation removed

  console.log(`✅ Created ${createdConversations.length} conversations`);
  return createdConversations;
};

// --- Create messages ---
const createMessages = async (users: any[], conversations: any[]) => {
  console.log("💭 Creating messages...");
  const created: any[] = [];

  for (const conv of conversations) {
    // fetch participants for conversation
    const parts = await prisma.conversationParticipant.findMany({
      where: { conversationId: conv.id },
    });
    if (!parts.length) continue;

    for (let i = 0; i < SAMPLE_MESSAGES.length; i++) {
      const senderId = parts[i % parts.length].userId;
      const msg = await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId,
            text: SAMPLE_MESSAGES[i].text,
            // cast to any to avoid strict enum type mismatch with generated Prisma types
            messageType: SAMPLE_MESSAGES[i].messageType as any,
          status: SAMPLE_MESSAGES[i].status as any,
        },
      });

      created.push(msg);
    }
  }

  console.log(`✅ Created ${created.length} messages`);
  return created;
};

// --- Create friendships ---
const createFriendships = async (users: any[]) => {
  console.log("🤝 Creating friendships...");
  const students = users.filter((u) => u.role === "user");
  const teachers = users.filter((u) => u.role === "teacher");

  // Students befriending each other
  for (let i = 0; i < students.length - 1; i++) {
    try {
      await prisma.friendship.upsert({
        // use `any` for composite unique where to avoid generated-type mismatches
        where: ({ requesterId_recipientId: { requesterId: students[i].id, recipientId: students[i + 1].id } } as any),
        update: { status: "accepted" },
        create: ({
          requesterId: students[i].id,
          recipientId: students[i + 1].id,
          status: "accepted",
        } as any),
      });
    } catch (e) {}
  }

  // Teachers befriending each other
  for (let i = 0; i < teachers.length - 1; i++) {
    try {
      await prisma.friendship.upsert({
        where: ({ requesterId_recipientId: { requesterId: teachers[i].id, recipientId: teachers[i + 1].id } } as any),
        update: { status: "accepted" },
        create: ({
          requesterId: teachers[i].id,
          recipientId: teachers[i + 1].id,
          status: "accepted",
        } as any),
      });
    } catch (e) {}
  }

  console.log("✅ Created friendships");
};






// --- Create quick lessons ---
const createQuickLessons = async (users: any[], conversations: any[]) => {
  console.log("📚 Creating quick lessons...");
  const teachers = users.filter((u) => u.role === "teacher");

  for (const lesson of SAMPLE_QUICK_LESSONS) {
    try {
      const created = await prisma.quickLesson.create({
        data: {
          conversationId: conversations[2]?.id || conversations[0].id,
          userId: teachers[0]?.id || users[0].id,
          lessonName: lesson.lessonName,
          parts: {
            create: lesson.lessonParts.map((part, idx) => ({
              content: part,
              order: idx + 1,
            })),
          },
        } as any,
      });
    } catch (e) {}
  }

  console.log("✅ Created quick lessons");
};

// --- Create notifications ---
const createNotifications = async (users: any[]) => {
  console.log("🔔 Creating notifications...");
  const notificationTypes: Array<"join_request"|"message"|"system"|"friend_request"> = [
    "message",
    "message",
    "join_request",
    "friend_request",
  ];

  for (let i = 0; i < Math.min(5, users.length); i++) {
    try {
      await prisma.notification.create({
        data: {
          recipientId: users[i].id,
          senderId: users[(i + 1) % users.length].id,
          type: notificationTypes[i % notificationTypes.length] as any,
          title: notificationTypes[i % notificationTypes.length].replace(/_/g, " ").slice(0, 60),
          message: `You have a new ${notificationTypes[i % notificationTypes.length].replace(/_/g, " ")}`,
          isRead: Math.random() > 0.5,
        } as any,
      });
    } catch (e) {}
  }

  console.log("✅ Created notifications");
};

// --- Create reports ---
const createReports = async (users: any[], conversations: any[]) => {
  console.log("📢 Creating reports...");
  const reportReasons: Array<"spam"|"harassment"|"hate_speech"|"violence"> = [
    "spam",
    "harassment",
    "hate_speech",
    "violence",
  ];

  for (let i = 0; i < 2; i++) {
    try {
      await prisma.report.create({
        data: {
          reportedUserId: users[i + 2]?.id,
          reporterId: users[i].id,
          reason: reportReasons[i % reportReasons.length] as any,
          details: `Report for ${reportReasons[i % reportReasons.length]} behavior`,
          status: "pending" as any,
          conversationId: conversations[0]?.id,
        } as any,
      });
    } catch (e) {}
  }

  console.log("✅ Created reports");
};
const createAdminSettings = async (adminUserId: string) => {
  console.log("⚙️  Creating default admin settings...");

  const allowed = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "pdf",
    "doc",
    "docx",
    "mp3",
    "mp4",
    "webp",
    "svg",
  ];
  const blocked = ["spam", "inappropriate", "banned"];

  const settings = await prisma.adminSettings.create({
    data: {
      featureVoiceMessages: true,
      featureSmsNotif: true,
      featureImageSharing: true,
      featureVideoSharing: true,
      featureFileSharing: true,
      featureVoiceCalling: true,
      featureVideoCalling: true,
      featureGroupCreation: true,
      featureUserRegistration: true,

      secRequireAdminApproval: true,
      secAutoApproveAfterHours: 24,
      secMaxFileSizeMb: 50,
      secMessageEncryption: true,
      secTwoFactorRequired: false,
      secSessionTimeoutMinutes: 60,

      modAutoModerateMessages: false,
      modMaxMessageLength: 5000,
      modSpamDetection: true,
      modImageContentFilter: false,

      rlMessagesPerMinute: 30,
      rlFilesPerHour: 10,
      rlFriendRequestsPerDay: 20,
      rlGroupCreationPerDay: 5,

      notifAdminEmailAlerts: true,
      notifNewUserNotifications: true,
      notifSuspiciousActivityAlerts: true,
      notifSystemMaintenanceMode: false,

      updatedById: adminUserId,
      allowedFileTypes: { create: allowed.map((t) => ({ fileType: t })) },
      blockedWords: { create: blocked.map((w) => ({ word: w })) },
    },
  });

  console.log("✅ Admin settings created");
  return settings;
};

// --- Site security messages ---
const createSiteSecurityMessages = async () => {
  const existing = await prisma.siteSecurityMessage.findMany();
  if (existing && existing.length > 0) {
    console.log("ℹ️  Site security messages already exist, skipping");
    return existing[0];
  }

  // Create two records: original pair and a developer-friendly pin 'valid pin'
  const msgs = await prisma.$transaction([
    prisma.siteSecurityMessage.create({ data: { goodMessage: "assalam", badMessage: "goodmorning" } }),
    prisma.siteSecurityMessage.create({ data: { goodMessage: "valid pin", badMessage: "invalid pin" } }),
  ]);

  console.log("✅ Created site security messages (including 'valid pin')");
  return msgs[0];
};

// --- Main seed ---
const seed = async () => {
  console.log("\n🌱 Running Prisma seed script\n");
  try {
    await connectDatabase();

    const exists = await hasUsers();
    if (exists && !FORCE) {
      console.log("ℹ️  Users already exist. Running idempotent checks and exiting (use --force to recreate/overwrite).");
      // Ensure admin settings & site security messages exist
      const superadmin = await prisma.user.findFirst({ where: { role: 'superadmin' } });
      if (superadmin) await createAdminSettings(superadmin.id).catch(() => {});
      await createSiteSecurityMessages().catch(() => {});
      console.log("✅ Seed checks complete (no changes made). Use --force to force recreate resources.");
      return;
    }

    const users = await createUsers();
    const conversations = await createConversations(users);
    await createMessages(users, conversations);
    
    // Create relationships and additional data
    await createFriendships(users);
    await createQuickLessons(users, conversations);
    
    // Create notifications and reports
    await createNotifications(users);
    await createReports(users, conversations);

    const superadmin = users.find((u) => u.role === "superadmin");
    if (superadmin) await createAdminSettings(superadmin.id);
    await createSiteSecurityMessages();

    console.log("\n🎉 Prisma seeding finished successfully\n");
  } catch (err: any) {
    console.error("❌ Seed error:", err?.message ?? err);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

export const autoInitializeDatabase = async () => {
  try {
    const exists = await hasUsers();
    if (exists) {
      console.log("✅ Database already contains users, skip auto-initialize");
      return;
    }
    console.log("📭 Auto-initializing database with sample data...");
    const users = await createUsers();
    const conversations = await createConversations(users);
    await createMessages(users, conversations);
    
    // Create relationships and additional data
    await createFriendships(users);
    await createQuickLessons(users, conversations);
    await createNotifications(users);
    await createReports(users, conversations);
    
    const superadmin = users.find((u) => u.role === "superadmin");
    if (superadmin) await createAdminSettings(superadmin.id);
    await createSiteSecurityMessages();
    console.log("🎉 Auto-initialization complete");
  } catch (err: any) {
    console.error("Auto-init error:", err?.message ?? err);
  }
};

// Run seed when executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const argPath = process.argv[1]?.replace(/\\/g, '/');
const thisPath = __filename.replace(/\\/g, '/');
if (argPath && thisPath.endsWith(argPath.replace(/^.*?prisma/, 'prisma'))) {
  seed();
}
