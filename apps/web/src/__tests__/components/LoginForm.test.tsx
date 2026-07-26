import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    verifyTotp: vi.fn(),
  },
}));

import { MemoryRouter } from "react-router";
import LoginForm from "../../components/auth/LoginForm";
import { authAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const mockedLogin = authAPI.login as unknown as ReturnType<typeof vi.fn>;
const mockedRegister = authAPI.register as unknown as ReturnType<typeof vi.fn>;
const mockedVerifyTotp = authAPI.verifyTotp as unknown as ReturnType<
  typeof vi.fn
>;

function renderForm(onLogin = vi.fn()) {
  const result = render(
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <LoginForm onLogin={onLogin} />
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
  const submitButton = () =>
    result.container.querySelector(
      "button[type='submit']"
    ) as HTMLButtonElement;
  return { ...result, submitButton };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<LoginForm />", () => {
  it("shows validation errors for an empty/invalid submit", async () => {
    const user = userEvent.setup();
    const { submitButton } = renderForm();

    await user.click(submitButton());

    await waitFor(
      () => {
        expect(screen.getByLabelText(/email/i)).toHaveAttribute(
          "aria-invalid",
          "true"
        );
        expect(
          screen.getByLabelText(/password/i, { selector: "input" })
        ).toHaveAttribute("aria-invalid", "true");
      },
      { timeout: 3000 }
    );
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const user = userEvent.setup();
    const { submitButton } = renderForm();

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "short"
    );
    await user.click(submitButton());

    await waitFor(
      () => {
        expect(
          screen.getByLabelText(/password/i, { selector: "input" })
        ).toHaveAttribute("aria-invalid", "true");
      },
      { timeout: 3000 }
    );
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("calls authAPI.login on valid submit and triggers onLogin", async () => {
    const onLogin = vi.fn();
    mockedLogin.mockResolvedValueOnce({ user: { role: "USER" } });

    const user = userEvent.setup();
    const { submitButton } = renderForm(onLogin);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith(
        "alice@example.com",
        "hunter222"
      );
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces server errors via the alert region", async () => {
    mockedLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    const user = userEvent.setup();
    const { submitButton } = renderForm();

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid credentials");
  });

  it("shows the 2FA prompt (not onLogin) when login returns a TOTP challenge", async () => {
    const onLogin = vi.fn();
    mockedLogin.mockResolvedValueOnce({
      totpRequired: true,
      challengeToken: "chal-123",
    });

    const user = userEvent.setup();
    const { submitButton } = renderForm(onLogin);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    // The credential form is replaced by the one-time-code prompt.
    expect(await screen.findByPlaceholderText("123456")).toBeInTheDocument();
    // Crucially, the session is NOT established until the code is verified.
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("verifies the TOTP code against the challenge token and completes login", async () => {
    const onLogin = vi.fn();
    mockedLogin.mockResolvedValueOnce({
      totpRequired: true,
      challengeToken: "chal-123",
    });
    mockedVerifyTotp.mockResolvedValueOnce({ user: { role: "USER" } });

    const user = userEvent.setup();
    const { submitButton } = renderForm(onLogin);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    const codeInput = await screen.findByPlaceholderText("123456");
    // The input strips non-digits and caps at 6 — typing junk yields "123456".
    await user.type(codeInput, "12ab3456x");
    expect(codeInput).toHaveValue("123456");

    await user.click(
      screen.getByRole("button", { name: /verify and sign in/i })
    );

    await waitFor(() => {
      expect(mockedVerifyTotp).toHaveBeenCalledWith("chal-123", "123456");
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces an invalid-code error in the 2FA step and keeps the prompt open", async () => {
    const onLogin = vi.fn();
    mockedLogin.mockResolvedValueOnce({
      totpRequired: true,
      challengeToken: "chal-123",
    });
    mockedVerifyTotp.mockRejectedValueOnce(new Error("Invalid code"));

    const user = userEvent.setup();
    const { submitButton } = renderForm(onLogin);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    const codeInput = await screen.findByPlaceholderText("123456");
    await user.type(codeInput, "000000");
    await user.click(
      screen.getByRole("button", { name: /verify and sign in/i })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid code");
    // Still on the 2FA step, session not established.
    expect(screen.getByPlaceholderText("123456")).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("on register tab calls register followed by login", async () => {
    mockedRegister.mockResolvedValueOnce(undefined);
    mockedLogin.mockResolvedValueOnce({ user: { role: "USER" } });

    const user = userEvent.setup();
    const { submitButton } = renderForm();

    // Switch to the register tab (first button with "register" name)
    const registerTab = screen.getAllByRole("button", {
      name: /register/i,
    })[0];
    await user.click(registerTab);

    await user.type(screen.getByLabelText(/email/i), "bob@example.com");
    await user.type(
      screen.getByLabelText(/password/i, { selector: "input" }),
      "hunter222"
    );
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith(
        "bob@example.com",
        "hunter222"
      );
      expect(mockedLogin).toHaveBeenCalledWith("bob@example.com", "hunter222");
    });
  });
});
