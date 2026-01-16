-- Mazaj Database Schema
-- PostgreSQL with pgvector extension

-- Enable pgvector extension (run once)
CREATE EXTENSION IF NOT EXISTS vector;

-- Custom ENUM types
CREATE TYPE "SenderRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "MessageType" AS ENUM ('CHAT', 'AI_ACCEPT', 'AI_REJECT');
CREATE TYPE "SongStatus" AS ENUM ('PENDING', 'PLAYING', 'PLAYED');

-- ============================================================================
-- Users Table
-- ============================================================================
CREATE TABLE public."User" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  name text,
  "avatarUrl" text,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT User_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- Party Table
-- ============================================================================
CREATE TABLE public."Party" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  code text NOT NULL,
  "hostId" text NOT NULL,
  "vibeDescription" text NOT NULL,
  "vibeRules" jsonb,
  "vibeEmbedding" vector(1536),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Party_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- Party Members Table
-- ============================================================================
CREATE TABLE public."PartyMember" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  "partyId" text NOT NULL,
  "userId" text NOT NULL,
  "joinedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT PartyMember_pkey PRIMARY KEY (id),
  CONSTRAINT partymember_partyid_fkey FOREIGN KEY ("partyId") REFERENCES public."Party"(id),
  CONSTRAINT partymember_userid_fkey FOREIGN KEY ("userId") REFERENCES public."User"(id)
);

-- ============================================================================
-- Song Queue Table
-- ============================================================================
CREATE TABLE public."Song" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  artist text NOT NULL,
  "coverUrl" text,
  "youtubeId" text,
  "addedBy" text NOT NULL,
  status "SongStatus" NOT NULL DEFAULT 'PENDING',
  "partyId" text NOT NULL,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Song_pkey PRIMARY KEY (id),
  CONSTRAINT Song_partyId_fkey FOREIGN KEY ("partyId") REFERENCES public."Party"(id)
);

-- ============================================================================
-- Chat Messages Table
-- ============================================================================
CREATE TABLE public."ChatMessage" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  content text NOT NULL,
  role "SenderRole" NOT NULL,
  type "MessageType" NOT NULL DEFAULT 'CHAT',
  metadata jsonb,
  "senderId" text,
  "partyId" text NOT NULL,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ChatMessage_pkey PRIMARY KEY (id),
  CONSTRAINT ChatMessage_partyId_fkey FOREIGN KEY ("partyId") REFERENCES public."Party"(id)
);

-- ============================================================================
-- Song Catalog Table (with vector embeddings)
-- ============================================================================
CREATE TABLE public."SongCatalog" (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  artist text NOT NULL,
  album text,
  lyrics text,
  year integer,
  rank integer,
  "youtubeId" text,
  "coverUrl" text,
  embedding vector(1536),
  mood text[],
  genre text,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT SongCatalog_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX idx_party_hostid ON public."Party"("hostId");
CREATE INDEX idx_party_code ON public."Party"(code);
CREATE INDEX idx_partymember_partyid ON public."PartyMember"("partyId");
CREATE INDEX idx_partymember_userid ON public."PartyMember"("userId");
CREATE INDEX idx_song_partyid ON public."Song"("partyId");
CREATE INDEX idx_chatmessage_partyid ON public."ChatMessage"("partyId");
CREATE INDEX idx_songcatalog_embedding ON public."SongCatalog" USING ivfflat (embedding vector_cosine_ops);
