-- 0028_pos_venda_email_triage.sql
-- Estrutura de Pós-Venda / Triagem Inteligente de E-mails no HUB

-- 1. Adicionar colunas de triagem de pós-venda na tabela public.tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS email_remetente TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assunto_email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS codigo_rastreio TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS codigo_pedido TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS urgencia TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS precisa_abrir_pi_correios BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_correios TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS resumo_ia TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT DEFAULT NULL;

-- 2. Constraints de validação (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_categoria_pos_venda_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_categoria_pos_venda_check
      CHECK (categoria IS NULL OR categoria IN ('extravio', 'avaria', 'atraso', 'duvida', 'outro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_urgencia_pos_venda_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_urgencia_pos_venda_check
      CHECK (urgencia IS NULL OR urgencia IN ('baixa', 'media', 'alta'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_status_correios_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_status_correios_check
      CHECK (status_correios IS NULL OR status_correios IN ('pendente', 'chamado_aberto', 'resolvido'));
  END IF;
END $$;

-- 3. Índices para busca rápida e prevenção de duplicidade por thread do Gmail
CREATE INDEX IF NOT EXISTS idx_tasks_pos_venda_categoria
  ON public.tasks(categoria)
  WHERE categoria IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_precisa_pi_correios
  ON public.tasks(precisa_abrir_pi_correios)
  WHERE precisa_abrir_pi_correios = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_gmail_thread_id_unique
  ON public.tasks(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL AND deleted_at IS NULL;

-- 4. Garantir a existência do projeto dedicado "Pós-Venda / Suporte"
INSERT INTO public.projects (id, name, description, color, owner_id, archived)
SELECT
  '00000000-0000-4000-a000-000000000501'::uuid,
  'Pós-Venda / Suporte',
  'Chamados de suporte, rastreio, avarias e atendimento ao cliente triados automaticamente via IA.',
  '#0ea5e9',
  (SELECT id FROM public.profiles WHERE role IN ('admin', 'member') ORDER BY created_at ASC LIMIT 1),
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects
  WHERE id = '00000000-0000-4000-a000-000000000501'::uuid
     OR lower(name) = 'pós-venda / suporte'
);

-- 5. Trigger inteligente para normalizar tarefas criadas pela automação de Pós-Venda
CREATE OR REPLACE FUNCTION public.normalize_pos_venda_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pos_venda_project_id UUID;
BEGIN
  -- Atua apenas se for um chamado de pós-venda (tem categoria ou email_remetente)
  IF NEW.categoria IS NOT NULL OR NEW.email_remetente IS NOT NULL THEN
    -- 5.1 Resolver project_id automaticamente caso não venha preenchido
    IF NEW.project_id IS NULL THEN
      SELECT id INTO v_pos_venda_project_id
      FROM public.projects
      WHERE id = '00000000-0000-4000-a000-000000000501'::uuid
         OR lower(name) = 'pós-venda / suporte'
      ORDER BY archived ASC, created_at ASC
      LIMIT 1;

      IF v_pos_venda_project_id IS NOT NULL THEN
        NEW.project_id := v_pos_venda_project_id;
      END IF;
    END IF;

    -- 5.2 Sincronizar urgencia -> priority do HUB se priority não foi especificada explicitamente
    IF NEW.urgencia = 'alta' THEN
      IF NEW.precisa_abrir_pi_correios THEN
        NEW.priority := 'urgent';
      ELSE
        NEW.priority := 'high';
      END IF;
    ELSIF NEW.urgencia = 'media' AND (NEW.priority IS NULL OR NEW.priority = 'medium') THEN
      NEW.priority := 'medium';
    ELSIF NEW.urgencia = 'baixa' AND (NEW.priority IS NULL OR NEW.priority = 'medium') THEN
      NEW.priority := 'low';
    END IF;

    -- 5.3 Garantir status_correios padrão
    IF NEW.status_correios IS NULL THEN
      NEW.status_correios := 'pendente';
    END IF;

    -- 5.4 Garantir tag 'pos-venda' e categoria 'Pós-Venda' para fácil filtragem global
    IF NEW.tags IS NULL THEN
      NEW.tags := ARRAY['pos-venda'];
    ELSIF NOT ('pos-venda' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'pos-venda');
    END IF;

    IF NEW.categories IS NULL THEN
      NEW.categories := ARRAY['Pós-Venda'];
    ELSIF NOT ('Pós-Venda' = ANY(NEW.categories)) THEN
      NEW.categories := array_append(NEW.categories, 'Pós-Venda');
    END IF;

    -- 5.5 Garantir data de início hoje se não informada
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pos_venda_task ON public.tasks;
CREATE TRIGGER trg_normalize_pos_venda_task
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_pos_venda_task();
