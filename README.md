# Mazaj Backend

REST API server for the Mazaj AI DJ Party application. Handles authentication, party management, song queues, and AI-powered chat interactions.

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database (hosted on Supabase)
- **pg** - PostgreSQL client
- **LangChain** - AI orchestration
- **OpenRouter** - LLM provider (Gemini model)
- **OpenAI** - Text embeddings
- **pgvector** - Vector similarity search
- **YouTube Data API v3** - Song discovery
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variables

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database with pgvector extension
- API keys for OpenRouter, OpenAI, and YouTube

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd Mazaj-Backend
```

2. Install dependencies
```bash
npm install
```

3. Create environment file
```bash
cp .env.sample .env
```

4. Update `.env` with your credentials

5. Set up the database
```bash
# Run schema.sql on your PostgreSQL database
psql -d your_database -f schema.sql
```
Or copy the contents of `schema.sql` into your Supabase SQL editor.

6. Start the server
```bash
npm start
```

Server runs on http://localhost:3000

## Project Structure

```
Mazaj-Backend/
├── server.js              # Express app entry point
├── db.js                  # PostgreSQL connection
├── schema.sql             # Database schema
├── routes/
│   ├── authRoutes.js      # Authentication endpoints
│   ├── partyRoutes.js     # Party & queue management
│   └── chatRoutes.js      # Chat & AI interactions
├── services/
│   ├── vibeExtractor.js   # AI vibe rules extraction
│   ├── songSearch.js      # Song catalog search
│   ├── songAnalyzer.js    # Song-vibe matching
│   └── youtubeSearch.js   # YouTube song lookup
├── agents/
│   └── djAgent.js         # AI DJ agent logic
├── package.json
└── .env
```

---

## API Endpoints

### Authentication Routes

Base URL: `/api/auth`

---

#### POST /api/auth/signup

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "avatarUrl": "https://example.com/avatar.jpg"  // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "User already exists"
}
```

---

#### POST /api/auth/login

Authenticate an existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

### Party Routes

Base URL: `/api/party`

---

#### POST /api/party

Create a new party.

**Request Body:**
```json
{
  "hostId": "user-uuid",
  "name": "Summer Vibes",
  "vibeDescription": "Upbeat 2000s pop hits, no slow songs, dance floor energy"
}
```

**Response (201):**
```json
{
  "success": true,
  "party": {
    "id": "party-uuid",
    "code": "MZ-A1B2",
    "hostId": "user-uuid",
    "vibeDescription": "Upbeat 2000s pop hits...",
    "vibeRules": { /* AI-extracted rules */ },
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "message": "Party created successfully"
}
```

---

#### GET /api/party/:id

Get party by ID.

**Response (200):**
```json
{
  "success": true,
  "party": {
    "id": "party-uuid",
    "code": "MZ-A1B2",
    "hostId": "user-uuid",
    "vibeDescription": "...",
    "vibeRules": { },
    "isActive": true,
    "createdAt": "..."
  }
}
```

---

#### GET /api/party/code/:code

Get party by invite code.

**Response (200):**
```json
{
  "success": true,
  "party": { /* party object */ }
}
```

---

#### GET /api/party/user/:userId

Get all parties hosted by a user (with members).

**Response (200):**
```json
{
  "success": true,
  "parties": [
    {
      "id": "party-uuid",
      "code": "MZ-A1B2",
      "vibeDescription": "...",
      "members": [
        {
          "id": "user-uuid",
          "name": "John",
          "avatarUrl": "...",
          "email": "john@example.com"
        }
      ]
    }
  ]
}
```

---

#### DELETE /api/party/:id

Delete a party (host only). Cascades to delete all related data.

**Request Body:**
```json
{
  "userId": "host-user-uuid"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Party deleted successfully"
}
```

---

#### POST /api/party/:id/join

Join a party as a member.

**Request Body:**
```json
{
  "userId": "user-uuid"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Joined party successfully",
  "party": { /* party object */ }
}
```

---

#### GET /api/party/:id/members

Get all members of a party.

**Response (200):**
```json
{
  "success": true,
  "members": [
    {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "...",
      "joinedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

#### GET /api/party/:id/queue

Get the song queue for a party.

**Response (200):**
```json
{
  "success": true,
  "queue": [
    {
      "id": "song-uuid",
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "coverUrl": "...",
      "youtubeId": "4NRXx6U8ABQ",
      "addedBy": "user-uuid",
      "status": "PLAYING",
      "partyId": "party-uuid",
      "createdAt": "..."
    }
  ]
}
```

---

#### POST /api/party/:id/queue

Manually add a song to the queue.

**Request Body:**
```json
{
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "coverUrl": "https://...",
  "youtubeId": "4NRXx6U8ABQ",
  "addedBy": "user-uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "song": { /* song object */ },
  "message": "Song added to queue"
}
```

---

#### PATCH /api/party/:id/queue/:songId

Update a song's status.

**Request Body:**
```json
{
  "status": "PLAYING"  // PENDING | PLAYING | PLAYED
}
```

**Response (200):**
```json
{
  "success": true,
  "song": { /* updated song object */ }
}
```

---

### Chat Routes

Base URL: `/api/chat`

---

#### POST /api/chat/send

Send a message to the AI DJ.

**Request Body:**
```json
{
  "partyId": "party-uuid",
  "senderId": "user-uuid",
  "content": "Can you play Blinding Lights by The Weeknd?"
}
```

**Response (200):**
```json
{
  "success": true,
  "userMessage": {
    "id": "msg-uuid",
    "content": "Can you play Blinding Lights...",
    "role": "USER",
    "type": "CHAT",
    "senderId": "user-uuid",
    "partyId": "party-uuid"
  },
  "aiResponse": {
    "id": "msg-uuid",
    "content": "Great choice! Blinding Lights fits perfectly...",
    "role": "ASSISTANT",
    "type": "AI_ACCEPT",  // AI_ACCEPT | AI_REJECT | CHAT
    "partyId": "party-uuid"
  },
  "updatedQueue": [ /* current queue */ ]
}
```

---

#### GET /api/chat/:partyId/history

Get chat history for a party.

**Query Parameters:**
- `limit` (optional): Number of messages (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg-uuid",
      "content": "Hello!",
      "role": "USER",
      "type": "CHAT",
      "senderId": "user-uuid",
      "senderName": "John Doe",
      "senderAvatar": "...",
      "partyId": "party-uuid",
      "createdAt": "..."
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Database Schema

### Tables

- **User** - User accounts
- **Party** - Party sessions
- **PartyMember** - Party membership tracking
- **Song** - Queue items with status
- **ChatMessage** - Chat history
- **SongCatalog** - Song database with embeddings

### Song Status Flow

```
PENDING → PLAYING → PLAYED
```

---

## Environment Variables

See `.env.sample` for required configuration.
