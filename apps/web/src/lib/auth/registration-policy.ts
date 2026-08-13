export type RegistrationConflict = "available" | "existing_email" | "username_taken";

export function resolveRegistrationConflict(input: {
  emailExists: boolean;
  usernameExists: boolean;
}): RegistrationConflict {
  if (input.usernameExists) {
    return "username_taken";
  }

  return input.emailExists ? "existing_email" : "available";
}
