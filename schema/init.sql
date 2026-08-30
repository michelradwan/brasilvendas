-- ==============================================================================
-- RADWAN ADS — SCHEMA MULTI-TENANT & RLS (SUPABASE POSTGRESQL)
-- ==============================================================================

-- 1. EXTENSÃO UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE WORKSPACES (OPERAÇÕES / CLIENTES)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    currency TEXT DEFAULT 'BRL',
    locale TEXT DEFAULT 'pt-BR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA DE MEMBROS E RBAC (OWNER, ADMIN, MANAGER, VIEWER)
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- 5. TABELA DE CONEXÕES META (INDIVIDUAIS POR WORKSPACE)
CREATE TABLE IF NOT EXISTS public.meta_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    meta_user_id TEXT,
    encrypted_access_token TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABELA DE CONTAS DE ANÚNCIOS VINCULADAS AO WORKSPACE
CREATE TABLE IF NOT EXISTS public.ad_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    meta_ad_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'BRL',
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, meta_ad_account_id)
);

-- 7. TABELA DE LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRIGGER DE AUTO-CRIAÇÃO DE PERFIL APÓS REGISTRO NO SUPABASE AUTH
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
