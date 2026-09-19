import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotasCell } from "./NotasCell";

describe("NotasCell", () => {
  test("muestra un guion cuando no hay notas", () => {
    render(<NotasCell notas={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("muestra el texto completo sin botón cuando es corto", () => {
    render(<NotasCell notas="Cliente nuevo" />);
    expect(screen.getByText("Cliente nuevo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("colapsa notas largas y las expande al hacer click", async () => {
    const notas = "Uno dos tres cuatro cinco seis siete ocho nueve diez";
    render(<NotasCell notas={notas} />);

    expect(screen.getByText(/Uno dos tres cuatro cinco seis…/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ampliar" }));

    expect(screen.getByText(notas)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contraer" })).toBeInTheDocument();
  });
});
