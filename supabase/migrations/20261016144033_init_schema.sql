-- ============================================
-- Multi-Tenant SaaS Database Schema - generative-os
-- ============================================
-- Este schema implementa um sistema multi-tenant usando:
-- 1. Row Level Security (RLS) para isolamento de dados
-- 2. Policies baseadas em tenant_id
-- 3. Support para Passkeys (WebAuthn)
-- 4. Billing management (PagSeguro/Pix)

-- ============================================
-- Extensões Necessárias
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"

CREATE EXTENSION IF NOT EXISTS "pgcrypto"

-- ============================================
-- Enums Personalizados
-- ============================================
CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'on_trial', 'suspended', 'cancelled')

CREATE TYPE subscription_plan AS ENUM ('free', 'starter', 'pro', 'enterprise', 'custom')

CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'paused', 'expired')

CREATE TYPE user_role AS ENUM ('super_admin', 'tenant_admin', 'tenant_member', 'tenant_viewer')

CREATE TYPE billing_interval AS ENUM ('month', 'year')

CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'boleto', 'bank_transfer')

CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'cancelled', 'refunded')

-- ============================================
-- Tabelas Principais
-- ============================================

-- Tabela de tenants (organizações/clientes)
-- Esta tabela armazena as organizações que usam o SaaS
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  brand_name VARCHAR(255),
  logo_url TEXT,
  color_scheme JSONB DEFAULT '{"primary": "#0f62fe", "secondary": "#393939"}',
  theme_settings JSONB DEFAULT '{}',
  status tenant_status DEFAULT 'on_trial' NOT NULL,
  trial_end_date TIMESTAMP WITH TIME ZONE,
  plan subscription_plan DEFAULT 'free' NOT NULL,
  max_users INTEGER DEFAULT 10 NOT NULL,
  current_user_count INTEGER DEFAULT 0 NOT NULL,
  features_enabled JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE tenants IS 'Armazena os tenants (organizações/clientes) do SaaS'

COMMENT ON COLUMN tenants.slug IS 'URL-friendly identifier (ex: mycompany)'

COMMENT ON COLUMN tenants.color_scheme IS 'Cores personalizadas do tenant para UI'

COMMENT ON COLUMN tenants.theme_settings IS 'Configurações de tema (dark/light mode defaults)'

COMMENT ON COLUMN tenants.features_enabled IS 'Features específicas habilitadas para este tenant'

-- Index para buscas por slug
CREATE INDEX idx_tenants_slug ON tenants(slug)

-- Tabela de usuários (extensão da auth.users do Supabase)
-- Esta tabela armazena metadados adicionais dos usuários
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  phone VARCHAR(50),
  preferred_language VARCHAR(10) DEFAULT 'pt-BR',
  settings JSONB DEFAULT '{"notifications": true, "theme": "system"}',
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE users IS 'Metadados extensivos dos usuários (extendendo auth.users)'

-- Index para buscas por tenant
CREATE INDEX idx_users_tenant_id ON users(tenant_id)

CREATE INDEX idx_users_tenant_display_name ON users(tenant_id, display_name)

-- Tabela de relacionamento user-tenant (permite usuário em múltiplos tenants)
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role DEFAULT 'tenant_member' NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  permissions JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  UNIQUE(user_id, tenant_id)
)

COMMENT ON TABLE tenant_users IS 'Relacionamento muitos-para-muitos entre usuários e tenants'

-- Index para buscas
CREATE INDEX idx_tenant_users_user_id ON tenant_users(user_id)

CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id)

CREATE UNIQUE INDEX idx_tenant_users_unique ON tenant_users(user_id, tenant_id)

-- Tabela de Passkeys (WebAuthn)
-- Armazena credenciais WebAuthn para autenticação sem senha
CREATE TABLE passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  credential_id BYTEA NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  attestation_type VARCHAR(255),
  transport VARCHAR(50)[],
  aaguid UUID,
  sign_count INTEGER DEFAULT 0,
  backup_state BOOLEAN DEFAULT false,
  device_type VARCHAR(50) CHECK (device_type IN ('single_device', 'multi_device', 'unknown')),
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_primary BOOLEAN DEFAULT false,
  is_compromised BOOLEAN DEFAULT false
)

COMMENT ON TABLE passkeys IS 'Armazena credenciais WebAuthn para autenticação via Passkeys'

-- Index para buscas
CREATE INDEX idx_passkeys_user_id ON passkeys(user_id)

CREATE INDEX idx_passkeys_credential_id ON passkeys(credential_id)

-- Tabela de assinaturas (billing)
CREATE TABLE billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL,
  status subscription_status DEFAULT 'active' NOT NULL,
  interval billing_interval DEFAULT 'month' NOT NULL,
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE billing_subscriptions IS 'Gerencia assinaturas e planos dos tenants'

-- Index para buscas
CREATE INDEX idx_billing_subscriptions_tenant_id ON billing_subscriptions(tenant_id)

CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status)

-- Tabela de pagamentos/transações
CREATE TABLE billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES billing_subscriptions(id),
  amount INTEGER NOT NULL, -- Valor em centavos
  currency VARCHAR(3) DEFAULT 'BRL' NOT NULL,
  method payment_method NOT NULL,
  status payment_status DEFAULT 'pending' NOT NULL,
  external_id VARCHAR(255), -- ID do PagSeguro/Pix
  payment_details JSONB DEFAULT '{}'::jsonb,
  invoice_url TEXT,
  failed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE billing_transactions IS 'Histórico de pagamentos e transações'

-- Index para buscas
CREATE INDEX idx_billing_transactions_tenant_id ON billing_transactions(tenant_id)

CREATE INDEX idx_billing_transactions_status ON billing_transactions(status)

CREATE INDEX idx_billing_transactions_external_id ON billing_transactions(external_id)

-- Tabela de configurações do tenant
CREATE TABLE tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value JSONB DEFAULT '{}'::jsonb,
  scope VARCHAR(50) DEFAULT 'general' CHECK (scope IN ('general', 'auth', 'branding', 'feature_flags', 'api')),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, key)
)

COMMENT ON TABLE tenant_settings IS 'Configurações específicas por tenant'

-- Index para buscas
CREATE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id)

CREATE INDEX idx_tenant_settings_key ON tenant_settings(key)

-- Tabela de webhooks (para integrações externas)
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(255) NOT NULL, -- ex: 'user.created', 'billing.payment.success'
  endpoint_url TEXT NOT NULL,
  secret_hash VARCHAR(255), -- Hash para validação de assinatura
  is_active BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}'::jsonb,
  last_delivered_at TIMESTAMP WITH TIME ZONE,
  last_delivery_status VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE webhooks IS 'Webhooks para integrações externas e eventos'

-- Index para buscas
CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id)

CREATE INDEX idx_webhooks_event_type ON webhooks(event_type)

-- Tabela de audit logs (para compliance e segurança)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL, -- ex: 'user.created', 'settings.updated'
  resource_type VARCHAR(100),
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

COMMENT ON TABLE audit_logs IS 'Logs de auditoria para compliance e segurança'

-- Index para buscas
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id)

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(created_at)

-- ============================================
-- Views Úteis
-- ============================================

-- View para visualizar tenants com contagem de usuários
CREATE VIEW tenant_stats AS
SELECT 
  t.id,
  t.name,
  t.slug,
  t.status,
  t.plan,
  t.max_users,
  COUNT(u.id) as user_count,
  COUNT(CASE WHEN tu.role = 'tenant_admin' THEN 1 END) as admin_count,
  COUNT(CASE WHEN tu.role = 'tenant_member' THEN 1 END) as member_count,
  COUNT(CASE WHEN tu.role = 'tenant_viewer' THEN 1 END) as viewer_count,
  t.created_at,
  t.updated_at
FROM tenants t
LEFT JOIN tenant_users tu ON t.id = tu.tenant_id
LEFT JOIN users u ON tu.user_id = u.id
GROUP BY t.id

COMMENT ON VIEW tenant_stats IS 'Visão consolidada de estatísticas por tenant'

-- View para usuários com detalhes do tenant
CREATE VIEW users_with_tenant AS
SELECT 
  u.id as user_id,
  u.display_name,
  u.avatar_url,
  u.tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug,
  tu.role,
  tu.is_default,
  t.status as tenant_status,
  t.plan as tenant_plan,
  auth_users.email
FROM users u
JOIN tenant_users tu ON u.id = tu.user_id
JOIN tenants t ON tu.tenant_id = t.id
JOIN auth.users auth_users ON u.id = auth_users.id

COMMENT ON VIEW users_with_tenant IS 'Visualização unificada de usuários e seus tenants'

-- ============================================
-- Policies de Row Level Security (RLS)
-- ============================================

-- Habilitar RLS nas tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY

ALTER TABLE users ENABLE ROW LEVEL SECURITY

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY

ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY

-- ============================================
-- Policies: tenants
-- ============================================

-- Super admins acessam todos os tenants
-- Tenants acessam apenas seu próprio tenant
-- Authenticated users podem ler (SELECT) seus tenants
CREATE POLICY tenants_select_policy ON tenants
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = id::text
  )

-- Apenas super admins ou tenant admins podem insert
CREATE POLICY tenants_insert_policy ON tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin'
    OR auth.jwt()->>'tenant_id' = id::text
  )

-- Apenas super admins ou tenant admins podem update
CREATE POLICY tenants_update_policy ON tenants
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = id::text
  )

-- Apenas super admins podem delete
CREATE POLICY tenants_delete_policy ON tenants
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
  )

-- ============================================
-- Policies: users
-- ============================================

-- Políticas baseadas em tenant
CREATE POLICY users_select_policy ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY users_insert_policy ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY users_update_policy ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY users_delete_policy ON users
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
  )

-- ============================================
-- Policies: tenant_users
-- ============================================

CREATE POLICY tenant_users_select_policy ON tenant_users
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_users_insert_policy ON tenant_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_users_update_policy ON tenant_users
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_users_delete_policy ON tenant_users
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

-- ============================================
-- Policies: passkeys
-- ============================================

CREATE POLICY passkeys_select_policy ON passkeys
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR user_id = (SELECT id FROM users WHERE auth.uid() = auth.uid())
  )

CREATE POLICY passkeys_insert_policy ON passkeys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR user_id = (SELECT id FROM users WHERE auth.uid() = auth.uid())
  )

CREATE POLICY passkeys_update_policy ON passkeys
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR user_id = (SELECT id FROM users WHERE auth.uid() = auth.uid())
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR user_id = (SELECT id FROM users WHERE auth.uid() = auth.uid())
  )

CREATE POLICY passkeys_delete_policy ON passkeys
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
    OR user_id = (SELECT id FROM users WHERE auth.uid() = auth.uid())
  )

-- ============================================
-- Policies: billing_subscriptions
-- ============================================

CREATE POLICY billing_subscriptions_select_policy ON billing_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY billing_subscriptions_insert_policy ON billing_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY billing_subscriptions_update_policy ON billing_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY billing_subscriptions_delete_policy ON billing_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
  )

-- ============================================
-- Policies: billing_transactions
-- ============================================

CREATE POLICY billing_transactions_select_policy ON billing_transactions
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY billing_transactions_insert_policy ON billing_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY billing_transactions_update_policy ON billing_transactions
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

-- ============================================
-- Policies: tenant_settings
-- ============================================

CREATE POLICY tenant_settings_select_policy ON tenant_settings
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_settings_insert_policy ON tenant_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_settings_update_policy ON tenant_settings
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY tenant_settings_delete_policy ON tenant_settings
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
  )

-- ============================================
-- Policies: webhooks
-- ============================================

CREATE POLICY webhooks_select_policy ON webhooks
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY webhooks_insert_policy ON webhooks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY webhooks_update_policy ON webhooks
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY webhooks_delete_policy ON webhooks
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin'
  )

-- ============================================
-- Policies: audit_logs
-- ============================================

CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt()->>'role' = 'super_admin' 
    OR auth.jwt()->>'tenant_id' = tenant_id::text
  )

-- ============================================
-- Triggers para Auto-atualização
-- ============================================

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql'

-- Criar triggers para todas as tabelas que precisam de updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_tenant_users_updated_at
  BEFORE UPDATE ON tenant_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_passkeys_updated_at
  BEFORE UPDATE ON passkeys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_billing_transactions_updated_at
  BEFORE UPDATE ON billing_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column()

-- ============================================
-- Funções Auxiliares (RLS Helpers)
-- ============================================

-- Função para obter o tenant ID atual (baseada no JWT)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.jwt()->>'tenant_id'::uuid;
END;
$$ language 'plpgsql' stable

-- Função para verificar se o usuário é super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.jwt()->>'role' = 'super_admin';
END;
$$ language 'plpgsql' stable

-- Função para obter o role atual do usuário
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN COALESCE(auth.jwt()->>'role', 'tenant_member');
END;
$$ language 'plpgsql' stable

-- ============================================
-- Funções para Gerenciar Tenants
-- ============================================

-- Função para criar um novo tenant e associação de usuário
CREATE OR REPLACE FUNCTION create_tenant(
  p_name VARCHAR,
  p_slug VARCHAR,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Criar o tenant
  INSERT INTO tenants (name, slug, status, plan)
  VALUES (p_name, p_slug, 'active', 'free')
  RETURNING id INTO v_tenant_id;
  
  -- Criar associação de usuário (super admin do tenant)
  INSERT INTO users (id, tenant_id, display_name, email)
  SELECT 
    p_user_id,
    v_tenant_id,
    u.user_metadata->>'display_name',
    u.email
  FROM auth.users u
  WHERE u.id = p_user_id
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO tenant_users (user_id, tenant_id, role, is_default)
  VALUES (p_user_id, v_tenant_id, 'tenant_admin', true);
  
  -- Criar configurações padrão
  INSERT INTO tenant_settings (tenant_id, key, value)
  VALUES 
    (v_tenant_id, 'notification_preferences', '{"email": true, "push": true}'::jsonb),
    (v_tenant_id, 'language_settings', '{"default": "pt-BR", "supported": ["pt-BR", "en-US"]}'::jsonb);
  
  RETURN v_tenant_id;
END;
$$ language 'plpgsql' security definer

-- Função para adicionar usuário a um tenant
CREATE OR REPLACE FUNCTION add_user_to_tenant(
  p_user_id UUID,
  p_tenant_id UUID,
  p_role user_role DEFAULT 'tenant_member'
)
RETURNS uuid AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Se o usuário não existe, cria
  INSERT INTO users (id, tenant_id, display_name, email)
  SELECT 
    p_user_id,
    p_tenant_id,
    u.user_metadata->>'display_name',
    u.email
  FROM auth.users u
  WHERE u.id = p_user_id
  ON CONFLICT (id) DO UPDATE
    SET tenant_id = p_tenant_id;
  
  -- Criar ou atualizar associação
  INSERT INTO tenant_users (user_id, tenant_id, role, is_default)
  VALUES (p_user_id, p_tenant_id, p_role, NOT EXISTS (
    SELECT 1 FROM tenant_users WHERE user_id = p_user_id AND is_default = true
  ))
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET role = p_role,
        updated_at = NOW();
  
  RETURN p_user_id;
END;
$$ language 'plpgsql' security definer

-- ============================================
-- Inserções Iniciais (Seed Data)
-- ============================================

-- Nota: As configurações de pricing devem ser inseridas manualmente após criar um tenant
--通过 execute depois de criar o tenant real

-- ============================================
-- comentarios finais
-- ============================================

COMMENT ON SCHEMA public IS 'Schema principal para Multi-Tenant SaaS com Supabase, RLS e Passkeys support'