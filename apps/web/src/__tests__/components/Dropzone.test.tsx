import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dropzone } from "../../components/ui/Dropzone";

const img = new File(["x"], "photo.png", { type: "image/png" });
const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });

describe("<Dropzone />", () => {
  it("emits only files matching the accept prefixes on drop", () => {
    const onFiles = vi.fn();
    render(
      <Dropzone onFiles={onFiles} accept={["image/"]} label="Drop photos" />
    );

    fireEvent.drop(screen.getByText("Drop photos").closest("div")!, {
      dataTransfer: { files: [img, pdf] },
    });

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([img]);
  });

  it("forwards files chosen via the browse input", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    const { container } = render(
      <Dropzone onFiles={onFiles} label="Drop photos" />
    );

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, img);

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([img]);
  });
});
