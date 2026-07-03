-- Parceiro técnico fixo do condomínio (definido pelo síndico/admin).
ALTER TABLE "Condominium" ADD COLUMN "partnerId" TEXT;

ALTER TABLE "Condominium"
  ADD CONSTRAINT "Condominium_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Condominium_partnerId_idx" ON "Condominium"("partnerId");
