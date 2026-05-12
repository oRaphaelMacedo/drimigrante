-- ============================================================
-- Migration: 20260512000001_crm_stage.sql
-- Add crm_stage to assessments for kanban pipeline management
-- ============================================================

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS crm_stage TEXT
    NOT NULL DEFAULT 'novo'
    CHECK (crm_stage IN ('novo', 'contactado', 'proposta', 'convertido'));

-- Backfill: completed assessments with payments → 'convertido'
UPDATE public.assessments a
SET crm_stage = 'convertido'
WHERE a.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.assessment_id = a.id AND p.status = 'succeeded'
  );

CREATE INDEX idx_assessments_crm_stage ON public.assessments(crm_stage);
