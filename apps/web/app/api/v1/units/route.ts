import { NextResponse } from "next/server"
import { prisma } from "@/infrastructure/database/prisma"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"

export async function GET() {
  try {
    const user = await requireSessionUser()
    const units = await prisma.unit.findMany({
      where: { condominium: { tenantId: user.tenantId } },
      select: {
        id: true,
        identifier: true,
        block: true,
        floor: true,
        ownerEmail: true,
        condominium: { select: { id: true, name: true } },
      },
      orderBy: [{ block: "asc" }, { identifier: "asc" }],
    })
    const filtered =
      user.role === "CLIENT"
        ? units.filter((u) => u.ownerEmail === user.email)
        : units
    return NextResponse.json({ units: filtered })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
