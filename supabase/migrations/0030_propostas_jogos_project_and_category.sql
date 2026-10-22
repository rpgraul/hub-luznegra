-- 0030_propostas_jogos_project_and_category.sql
-- Cria projeto dedicado "Propostas de Jogos", adiciona categoria 'proposta_jogo' e regras para Diego Bassinello com prazo de 30 dias.

-- 1. Atualizar constraint de categoria em public.tasks
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_categoria_pos_venda_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_categoria_pos_venda_check
  CHECK (categoria IS NULL OR categoria IN ('extravio', 'avaria', 'atraso', 'duvida', 'desenvolvimento', 'proposta_jogo', 'outro'));

-- 2. Criar ou garantir o projeto dedicado "Propostas de Jogos" (ID fixo 00000000-0000-4000-a000-000000000502)
INSERT INTO public.projects (id, name, description, color, owner_id, archived)
SELECT
  '00000000-0000-4000-a000-000000000502'::uuid,
  'Propostas de Jogos',
  'Avaliação editorial de propostas e originais de jogos submetidos pelo formulário do site.',
  '#10b981',
  (SELECT id FROM public.profiles WHERE lower(username) = 'diego' LIMIT 1),
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects
  WHERE id = '00000000-0000-4000-a000-000000000502'::uuid
     OR lower(name) = 'propostas de jogos'
);

-- 3. Atualizar trigger normalize_pos_venda_task para lidar com propostas de jogos
CREATE OR REPLACE FUNCTION public.normalize_pos_venda_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pos_venda_project_id UUID;
  v_propostas_project_id UUID;
  v_rpgraul_id UUID;
  v_diego_id UUID;
  v_days_to_add INT;
BEGIN
  -- Se for proposta de jogo
  IF NEW.categoria = 'proposta_jogo' THEN
    -- 3.1 Vincular ao projeto dedicado "Propostas de Jogos"
    SELECT id INTO v_propostas_project_id
    FROM public.projects
    WHERE id = '00000000-0000-4000-a000-000000000502'::uuid
       OR lower(name) = 'propostas de jogos'
    ORDER BY archived ASC, created_at ASC
    LIMIT 1;

    IF v_propostas_project_id IS NOT NULL THEN
      NEW.project_id := v_propostas_project_id;
    END IF;

    -- 3.2 Designar @diego (Diego Bassinello)
    SELECT id INTO v_diego_id
    FROM public.profiles
    WHERE lower(username) = 'diego'
    LIMIT 1;

    IF v_diego_id IS NOT NULL THEN
      NEW.assigned_to := v_diego_id;
      NEW.assignees := ARRAY[v_diego_id];
    END IF;

    -- 3.3 Prazo de 30 dias corridos
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;
    NEW.due_date := NEW.start_date + 30;

    -- 3.4 Prioridade e tags editoriais
    NEW.priority := 'medium';
    IF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL THEN
      NEW.tags := ARRAY['proposta', 'editorial'];
    ELSIF NOT ('proposta' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'proposta');
    END IF;

    IF NEW.categories IS NULL OR array_length(NEW.categories, 1) IS NULL THEN
      NEW.categories := ARRAY['Propostas de Jogos'];
    END IF;

    NEW.precisa_abrir_pi_correios := false;
    NEW.status_correios := NULL;

    RETURN NEW;
  END IF;

  -- Fluxo existente para chamados de Pós-Venda / Suporte / Dev
  IF NEW.categoria IS NOT NULL OR NEW.email_remetente IS NOT NULL THEN
    -- 3.5 Vincular ao projeto Pós-Venda / Suporte se project_id não foi informado
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

    -- 3.6 Sincronizar urgência -> priority
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

    -- 3.7 Roteamento: se for desenvolvimento/técnico/site/segurança, atribuir a @rpgraul
    IF NEW.categoria = 'desenvolvimento' THEN
      SELECT id INTO v_rpgraul_id
      FROM public.profiles
      WHERE lower(username) = 'rpgraul'
      LIMIT 1;

      IF v_rpgraul_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
        NEW.assigned_to := v_rpgraul_id;
        IF NEW.assignees IS NULL THEN
          NEW.assignees := ARRAY[v_rpgraul_id];
        ELSIF NOT (v_rpgraul_id = ANY(NEW.assignees)) THEN
          NEW.assignees := array_append(NEW.assignees, v_rpgraul_id);
        END IF;
      END IF;
    END IF;

    -- 3.8 Status correios padrão
    IF NEW.status_correios IS NULL THEN
      NEW.status_correios := 'pendente';
    END IF;

    -- 3.9 Tags e categorias automáticas
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

    -- 3.10 Data de início: se não fornecida, hoje
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;

    -- 3.11 Cálculo dinâmico de due_date (se não fornecido)
    IF NEW.due_date IS NULL THEN
      IF NEW.priority = 'urgent' OR NEW.priority = 'high' THEN
        v_days_to_add := 3;
      ELSIF NEW.priority = 'low' THEN
        v_days_to_add := 10;
      ELSE
        v_days_to_add := 5;
      END IF;

      NEW.due_date := NEW.start_date + v_days_to_add;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Migrar tarefas existentes de Douglas Baiense para o novo projeto e designar Diego
-- 4.1 Deletar a duplicata mais recente
DELETE FROM public.tasks
WHERE id = '59b421d7-c3c4-4ee1-85db-693402498aa8';

-- 4.2 Ajustar a tarefa 601ebbc4-6bb2-4680-b61b-4f81b6bd2bd7
UPDATE public.tasks
SET
  project_id = '00000000-0000-4000-a000-000000000502'::uuid,
  assigned_to = (SELECT id FROM public.profiles WHERE lower(username) = 'diego' LIMIT 1),
  assignees = ARRAY[(SELECT id FROM public.profiles WHERE lower(username) = 'diego' LIMIT 1)],
  categoria = 'proposta_jogo',
  due_date = '2026-11-21',
  priority = 'medium',
  tags = ARRAY['proposta', 'editorial'],
  categories = ARRAY['Propostas de Jogos'],
  precisa_abrir_pi_correios = false,
  status_correios = NULL
WHERE id = '601ebbc4-6bb2-4680-b61b-4f81b6bd2bd7';
