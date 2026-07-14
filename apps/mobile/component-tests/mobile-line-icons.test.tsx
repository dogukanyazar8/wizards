import { render } from "@testing-library/react-native";
import { MobileLineIcon } from "../src/design/mobile-line-icons";

interface RenderedNode {
  readonly children: readonly unknown[] | null;
  readonly props: Record<string, unknown>;
  readonly type: string;
}

function isRenderedNode(value: unknown): value is RenderedNode {
  return Boolean(value) && typeof value === "object" && "props" in value && "type" in value;
}

function getRenderedRoot(value: unknown): RenderedNode {
  if (!isRenderedNode(value)) {
    throw new Error("Expected one rendered SVG root");
  }

  return value;
}

function findRenderedNodes(root: RenderedNode, type: string): readonly RenderedNode[] {
  const children = (root.children ?? []).filter(isRenderedNode);
  return [
    ...(root.type === type ? [root] : []),
    ...children.flatMap((child) => findRenderedNodes(child, type)),
  ];
}

describe("MobileLineIcon", () => {
  it("renders labeled icons as accessible images", async () => {
    const view = await render(
      <MobileLineIcon accessibilityLabel="Search messages" color="#4F46E5" name="search" />,
    );
    const icon = view.getByLabelText("Search messages");

    expect(icon.props.accessible).toBe(true);
    expect(icon.props.accessibilityRole).toBe("image");
    expect(icon.props.accessibilityElementsHidden).toBe(false);
    expect(icon.props.importantForAccessibility).toBe("yes");
  });

  it("hides unlabeled decorative icons from accessibility services", async () => {
    const view = await render(<MobileLineIcon color="#676D90" name="chevron-right" />);
    const icon = getRenderedRoot(view.toJSON());

    expect(icon.props.accessible).toBe(false);
    expect(icon.props.accessibilityLabel).toBeUndefined();
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("preserves explicit round joins and omitted HTML joins", async () => {
    const roundedView = await render(<MobileLineIcon color="#4F46E5" name="servers" />);
    const roundedIcon = getRenderedRoot(roundedView.toJSON());
    const defaultJoinView = await render(<MobileLineIcon color="#676D90" name="edit" />);
    const defaultJoinIcon = getRenderedRoot(defaultJoinView.toJSON());

    expect(roundedIcon.props.strokeLinecap).toBe("round");
    expect(roundedIcon.props.strokeLinejoin).toBe("round");
    expect(defaultJoinIcon.props.strokeLinecap).toBe("round");
    expect(defaultJoinIcon.props.strokeLinejoin).toBeUndefined();
  });

  it("uses HTML widths by default and applies an explicit override to every stroke child", async () => {
    const defaultView = await render(<MobileLineIcon color="#4F46E5" name="bell" />);
    const defaultIcon = getRenderedRoot(defaultView.toJSON());

    expect(defaultIcon.props.width).toBe(20);
    expect(defaultIcon.props.height).toBe(20);
    expect(defaultIcon.props.minX).toBe(0);
    expect(defaultIcon.props.minY).toBe(0);
    expect(defaultIcon.props.vbWidth).toBe(24);
    expect(defaultIcon.props.vbHeight).toBe(24);
    expect(defaultIcon.props.fill).toBe("none");
    expect(defaultIcon.props.stroke).toBe("#4F46E5");
    expect(defaultIcon.props.strokeWidth).toBe(1.9);
    expect(defaultIcon.props.strokeLinecap).toBe("round");
    expect(defaultIcon.props.strokeLinejoin).toBe("round");

    const htmlWidthView = await render(
      <MobileLineIcon color="#A5A8F5" name="invite-user" size={24} />,
    );
    const htmlWidthIcon = getRenderedRoot(htmlWidthView.toJSON());
    const htmlWidthPaths = findRenderedNodes(htmlWidthIcon, "RNSVGPath");

    expect(htmlWidthIcon.props.strokeWidth).toBe(1.8);
    expect(htmlWidthPaths[0]?.props.strokeWidth).toBeUndefined();
    expect(htmlWidthPaths[1]?.props.strokeWidth).toBe(1.6);

    const overriddenView = await render(
      <MobileLineIcon color="#A5A8F5" name="invite-user" size={24} strokeWidth={3} />,
    );
    const overriddenIcon = getRenderedRoot(overriddenView.toJSON());
    const paths = findRenderedNodes(overriddenIcon, "RNSVGPath");
    const circles = findRenderedNodes(overriddenIcon, "RNSVGCircle");

    expect(overriddenIcon.props.width).toBe(24);
    expect(overriddenIcon.props.strokeWidth).toBe(3);
    expect(paths).toHaveLength(2);
    expect(paths[0]?.props.strokeWidth).toBe(3);
    expect(paths[1]?.props.strokeWidth).toBe(3);
    expect(circles[0]?.props.strokeWidth).toBe(3);
  });

  it("renders HTML Rect children and keeps filled icons free of strokes", async () => {
    const headphonesView = await render(<MobileLineIcon color="#FFFFFF" name="headphones" />);
    const headphonesIcon = getRenderedRoot(headphonesView.toJSON());
    const rects = findRenderedNodes(headphonesIcon, "RNSVGRect");

    expect(rects).toHaveLength(2);
    expect(rects[0]?.props).toEqual(
      expect.objectContaining({ height: 7, rx: 2, width: 4.5, x: 3, y: 13 }),
    );

    const sendView = await render(<MobileLineIcon color="#FFFFFF" name="send" />);
    const sendIcon = getRenderedRoot(sendView.toJSON());
    const [sendPath] = findRenderedNodes(sendIcon, "RNSVGPath");

    expect(sendIcon.props.fill).toBe("#FFFFFF");
    expect(sendIcon.props.stroke).toBe("none");
    expect(sendIcon.props.strokeWidth).toBeUndefined();
    expect(sendPath?.props.stroke).toBeUndefined();
    expect(sendPath?.props.strokeWidth).toBeUndefined();
  });
});
