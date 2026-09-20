import { userRepository } from "../repositories/user.repository";
import { AppError } from "../utils/AppError";
import type { UpdateUserPermissionsInput } from "../schemas/userPermissions.schema";

export async function listOrgUsers(organizationId: string) {
  return userRepository.listByOrganization(organizationId);
}

export async function updateUserPermissions(
  organizationId: string,
  userId: string,
  input: UpdateUserPermissionsInput,
) {
  const user = await userRepository.findById(organizationId, userId);
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }
  return userRepository.updatePermissions(organizationId, userId, input);
}
