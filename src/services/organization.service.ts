import { organizationRepository } from "../repositories/organization.repository";
import { slugify } from "../utils/slug";

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
}

// El admin de plataforma solo tipea el nombre (ver POST
// /api/admin/organizations en adminOrganizations.ts) -- el slug se deriva
// solo. Si hay colisión (dos organizaciones con nombres que normalizan al
// mismo slug), se le agrega un sufijo numérico incremental en vez de
// fallar: no tiene sentido pedirle al admin que piense en un slug único a
// mano por un detalle interno de la URL.
async function resolverSlugDisponible(base: string): Promise<string> {
  let slug = base;
  let intento = 1;

  while (await organizationRepository.findBySlug(slug)) {
    intento += 1;
    const sufijo = `-${intento}`;
    slug = `${base.slice(0, 100 - sufijo.length)}${sufijo}`;
  }

  return slug;
}

export async function createOrganization(name: string): Promise<OrganizationDto> {
  const slug = await resolverSlugDisponible(slugify(name));
  const organization = await organizationRepository.create({ name, slug });
  return { id: organization.id, name: organization.name, slug: organization.slug };
}
