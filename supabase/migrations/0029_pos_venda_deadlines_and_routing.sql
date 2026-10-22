-- 0029_pos_venda_deadlines_and_routing.sql
-- Adiciona categoria 'desenvolvimento', cálculo automático de prazos e roteamento para @rpgraul

-- 1. Atualizar constraint de categoria em public.tasks
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_categoria_pos_venda_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_categoria_pos_venda_check
  CHECK (categoria IS NULL OR categoria IN ('extravio', 'avaria', 'atraso', 'duvida', 'desenvolvimento', 'outro'));

-- 2. Atualizar trigger para calcular prazos (3 a 10 dias) e rotear desenvolvimento para @rpgraul
CREATE OR REPLACE FUNCTION public.normalize_pos_venda_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pos_venda_project_id UUID;
  v_rpgraul_id UUID;
  v_days_to_add INT;
BEGIN
  -- Identifica se é chamado de pós-venda ou suporte técnico
  IF NEW.categoria IS NOT NULL OR NEW.email_remetente IS NOT NULL THEN
    -- 2.1 Vincular ao projeto Pós-Venda / Suporte se project_id não foi informado
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

    -- 2.2 Sincronizar urgência -> priority
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

    -- 2.3 Roteamento: se for desenvolvimento/técnico/site/segurança, atribuir a @rpgraul
    IF NEW.categoria = 'desenvolvimento' THEN
      SELECT id INTO v_rpgraul_id
      FROM public.profiles
      WHERE lower(username) = 'rpgraul'
      LIMIT 1;

      IF v_rpgraul_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
        NEW.assigned_to := v_rpgraul_id;
        IF NEW.assignees IS NULL THEN
          NEW.assignees := ARRAY[v_rpgraul_id::text];
        ELSIF NOT (v_rpgraul_id::text = ANY(NEW.assignees)) THEN
          NEW.assignees := array_append(NEW.assignees, v_rpgraul_id::text);
        END IF;
      END IF;
    END IF;

    -- 2.4 Status correios padrão
    IF NEW.status_correios IS NULL THEN
      NEW.status_correios := 'pendente';
    END IF;

    -- 2.5 Tags e categorias automáticas
    IF NEW.tags IS NULL THEN
      NEW.tags := ARRAY['pos-venda'];
    ELSIF NOT ('pos-venda' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'pos-venda');
    END IF;

    IF NEW.categoria = 'desenvolvimento' AND NOT ('dev' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'dev');
    END IF;

    IF NEW.categories IS NULL THEN
      IF NEW.categoria = 'desenvolvimento' THEN
        NEW.categories := ARRAY['Pós-Venda', 'Desenvolvimento'];
      ELSE
        NEW.categories := ARRAY['Pós-Venda'];
      END IF;
    ELSIF NOT ('Pós-Venda' = ANY(NEW.categories)) THEN
      NEW.categories := array_append(NEW.categories, 'Pós-Venda');
    END IF;

    -- 2.6 Data de início: hoje
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;

    -- 2.7 Cálculo automático de prazo (due_date) entre 3 e 10 dias
    IF NEW.due_date IS NULL THEN
      IF NEW.priority IN ('urgent', 'high') THEN
        v_days_to_add := 3;
      ELSIF NEW.priority = 'medium' THEN
        v_days_to_add := 5;
      ELSE
        v_days_to_add := 10;
      END IF;

      NEW.due_date := CURRENT_DATE + v_days_to_add;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
