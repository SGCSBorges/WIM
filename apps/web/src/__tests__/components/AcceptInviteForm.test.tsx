import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  sharesAPI: { acceptInvite: vi.fn() },
}));

import { MemoryRouter } from "react-router";
import AcceptInviteForm from "../../components/sharing/AcceptInviteForm";
import { sharesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";

const mockedAccept = sharesAPI.acceptInvite as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
});

function renderForm() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AcceptInviteForm />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe("<AcceptInviteForm />", () => {
  it("calls sharesAPI.acceptInvite with the trimmed token on submit", async () => {
    mockedAccept.mockResolvedValueOnce({ permission: "READ" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/token/i), "  TKN-123  ");
    await user.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(mockedAccept).toHaveBeenCalledWith("TKN-123");
    });
  });

  it("surfaces a server error via the alert region", async () => {
    mockedAccept.mockRejectedValueOnce(new Error("Already accepted"));
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/token/i), "TKN-9");
    await user.click(screen.getByRole("button", { name: /accept/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Already accepted");
  });

  it("renders a success message with the granted permission on success", async () => {
    mockedAccept.mockResolvedValueOnce({ permission: "WRITE" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/token/i), "TKN-7");
    await user.click(screen.getByRole("button", { name: /accept/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("WRITE");
  });
});
