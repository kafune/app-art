-- Reconciliação de dados: Partner.tenantId é denormalizado de User.tenantId
-- e não era sincronizado quando um SUPER_ADMIN trocava o tenant de um
-- usuário parceiro (PATCH /api/v1/superadmin/users/:id). Corrige registros
-- já divergentes e limpa vínculos de "parceiro fixo" que ficaram apontando
-- para um parceiro de outro tenant (violaria o isolamento por tenant).
UPDATE "Partner" p
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE p."userId" = u.id AND p."tenantId" != u."tenantId";

UPDATE "Condominium" c
SET "partnerId" = NULL
FROM "Partner" p
WHERE c."partnerId" = p.id AND c."tenantId" != p."tenantId";
