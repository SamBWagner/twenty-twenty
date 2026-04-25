import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import CreateProjectForm from "./CreateProjectForm";

export default function NewProjectPage() {
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath: "/projects/new",
  });

  if (loading) return <AuthLoadingMessage label="Loading..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return (
    <div className="max-w-lg">
      <h1 className="mb-8 text-4xl font-bold uppercase text-stroke sm:text-5xl">
        <span className="text-primary">New</span> <span className="text-tertiary">Project</span>
      </h1>
      <CreateProjectForm />
    </div>
  );
}
