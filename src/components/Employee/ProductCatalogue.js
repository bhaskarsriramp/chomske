import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Avatar,
  Typography,
  CircularProgress,
  Tooltip,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  Divider,
  Autocomplete,
  useMediaQuery,
  MenuItem,
  Chip,
  InputAdornment,
  Card,
  CardContent,
  CardActions,
  Container,
  alpha,
  Pagination,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StorefrontIcon from "@mui/icons-material/Storefront";
import axios from "axios";
import format from "date-fns/format";

axios.defaults.withCredentials = true;

const API_BASE = "/api/usersOn";

/* ---------- Styled Components ---------- */

const StyledControlsBar = styled(Paper)(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: theme.zIndex.appBar - 1,
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2.5),
  background: alpha(theme.palette.background.paper, 0.95),
  backdropFilter: "blur(8px)",
  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  borderRadius: theme.spacing(1.5),
  boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
}));

const StyledSearchField = styled(TextField)(({ theme }) => ({
  "& .MuiOutlinedInput-root": {
    borderRadius: theme.spacing(1),
    transition: theme.transitions.create(["box-shadow", "border-color"]),
    backgroundColor: alpha(theme.palette.common.white, 0.5),
    "&:hover": {
      backgroundColor: alpha(theme.palette.common.white, 0.8),
    },
    "&.Mui-focused": {
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
      backgroundColor: theme.palette.common.white,
    },
  },
}));

const StyledProductCard = styled(Card)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  transition: theme.transitions.create(["transform", "box-shadow"], {
    duration: theme.transitions.duration.shorter,
  }),
  borderRadius: theme.spacing(1.5),
  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  "&:hover": {
    transform: "translateY(-4px)",
    boxShadow: `0 12px 24px ${alpha(theme.palette.common.black, 0.12)}`,
  },
}));

const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  borderRadius: theme.spacing(1.5),
  "& table": {
    minWidth: 800,
  },
  "& thead": {
    backgroundColor: alpha(theme.palette.primary.main, 0.05),
    "& th": {
      fontWeight: 600,
      color: theme.palette.text.primary,
      borderBottom: `2px solid ${alpha(theme.palette.divider, 0.2)}`,
    },
  },
  "& tbody tr": {
    transition: theme.transitions.create(["background-color"]),
    "&:hover": {
      backgroundColor: alpha(theme.palette.primary.main, 0.03),
    },
  },
}));

/* ---------- Small helpers ---------- */

function AffiliateThumb({ product }) {
  const [src, setSrc] = React.useState(product?.imageUrl || null);
  const [error, setError] = React.useState(false);
  const key = product?.imageUrl || product?.link || product?._id;

  React.useEffect(() => {
    let cancelled = false;
    if (product?.imageUrl || product?.type === "digital" || !product?.link)
      return;

    (async () => {
      try {
        const { data } = await axios.post(`${API_BASE}/url-metadata`, {
          url: product.link,
        });
        const img = data?.image || null;
        if (!cancelled && img) {
          const safe = img.startsWith("http://")
            ? img.replace(/^http:\/\//, "https://")
            : img;
          setSrc(safe);
        }
      } catch {
        // silent fail
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!src || error) {
    return (
      <Avatar
        variant="rounded"
        sx={{
          width: 56,
          height: 56,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {product?.title ? product.title.slice(0, 2).toUpperCase() : "NA"}
      </Avatar>
    );
  }

  return (
    <Avatar
      variant="rounded"
      src={src}
      alt={product?.title}
      sx={{ width: 56, height: 56 }}
      imgProps={{ onError: () => setError(true), referrerPolicy: "no-referrer" }}
    />
  );
}

function a11yProps(index) {
  return {
    id: `add-prod-tab-${index}`,
    "aria-controls": `add-prod-tabpanel-${index}`,
  };
}

function TabPanel({ children, value, index }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`add-prod-tabpanel-${index}`}
      aria-labelledby={`add-prod-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const MAX_LINK_LEN = 36;
const truncate = (str, max = MAX_LINK_LEN) =>
  !str ? "" : str.length > max ? str.slice(0, max) + "…" : str;

/* ---------- Main component ---------- */

export default function Store() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isSm = useMediaQuery(theme.breakpoints.only("sm"));
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(0);
  const limit = 12;
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [storeEnabled, setStoreEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProductType, setEditingProductType] = useState(null); // NEW: track product type being edited
  const [activeTab, setActiveTab] = useState(0);

  // Filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt_desc");
  const qDebounce = useRef();

  // Affiliate Link form
  const [affTitle, setAffTitle] = useState("");
  const [affUrl, setAffUrl] = useState("");
  const [affCategory, setAffCategory] = useState(null);
  const [affThumb, setAffThumb] = useState(null);
  const [affManualFile, setAffManualFile] = useState(null);
  const [affManualPreview, setAffManualPreview] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(null);

  // Digital Product form
  const [digCategory, setDigCategory] = useState(null);
  const [digName, setDigName] = useState("");
  const [digDesc, setDigDesc] = useState("");
  const [digPrice, setDigPrice] = useState(0);
  const [digFile, setDigFile] = useState(null);
  const [digPreview, setDigPreview] = useState(null);

  // Categories
  const [catOptions, setCatOptions] = useState([]);
  const [catLoading, setCatLoading] = useState(false);
  const catSearchRef = useRef("");
  const catDebounce = useRef();
  const [catQuery, setCatQuery] = useState("");

  /* ---------- Effects / data ---------- */

  useEffect(() => {
    fetchProducts(page + 1, limit);
    fetchStoreStatus();
    fetchCategories("");
    // eslint-disable-next-line
  }, [page]);

  async function fetchStoreStatus() {
    try {
      const res = await axios.get(`${API_BASE}/store-status`);
      if (res?.data?.enabled !== undefined)
        setStoreEnabled(Boolean(res.data.enabled));
    } catch (err) {
      console.warn("Could not fetch store status.", err);
    }
  }

  async function toggleStoreEnabled(nextValue) {
    const previous = storeEnabled;
    setStoreEnabled(nextValue);
    setToggling(true);
    try {
      await axios.post(`${API_BASE}/enable-store`, { enabled: nextValue });
    } catch (err) {
      console.error("Error toggling store enable:", err);
      setStoreEnabled(previous);
      alert("Failed to update store status. Please try again.");
    } finally {
      setToggling(false);
    }
  }

  async function fetchProducts(pageNo = 1, pageSize = 12) {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/fet-user-products`, {
        params: { page: pageNo, limit: pageSize },
      });
      setProducts(res.data.data || []);
      setTotal(res.data.total ?? 0);
    } catch (err) {
      console.error("Fetch user products error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories(search) {
    setCatLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/product-categories`, {
        params: { search },
      });
      setCatOptions(res?.data?.data || []);
    } catch (e) {
      console.error("fetchCategories error", e);
    } finally {
      setCatLoading(false);
    }
  }

  /* ---------- Category search ---------- */

  function handleCatSearch(inputValue) {
    setCatQuery(inputValue);
    catSearchRef.current = inputValue;
    clearTimeout(catDebounce.current);
    catDebounce.current = setTimeout(() => fetchCategories(inputValue), 350);
  }

  async function handleAddCategoryIfNeeded(label) {
    try {
      const res = await axios.post(`${API_BASE}/product-categories`, {
        name: label,
      });
      const newCat = res?.data?.category;
      if (newCat) {
        setCatOptions((prev) => [newCat, ...prev]);
        if (activeTab === 0) setAffCategory(newCat);
        else setDigCategory(newCat);
      }
    } catch (e) {
      console.error("add category error", e);
      alert(e?.response?.data?.message || "Failed to add category");
    }
  }

  const categoryOptionLabel = (opt) =>
    typeof opt === "string" ? opt : opt?.name || "";
  const catOptionsWithAdd = useMemo(() => {
    const q = (catQuery || "").trim();
    const exists = catOptions.some(
      (c) => c.name?.toLowerCase() === q.toLowerCase()
    );
    return q && !exists
      ? [{ _id: "__add__", name: `+ Add "${q}"` }, ...catOptions]
      : catOptions;
  }, [catOptions, catQuery]);

  function renderCategoryAutocomplete(value, onChange) {
    return (
      <Autocomplete
        options={catOptionsWithAdd}
        loading={catLoading}
        value={value}
        onChange={(_, newVal) => {
          if (newVal?._id === "__add__") {
            const label = (catQuery || "").trim();
            if (label) handleAddCategoryIfNeeded(label);
            return;
          }
          onChange(newVal);
        }}
        onInputChange={(_, newInput) => handleCatSearch(newInput)}
        getOptionLabel={categoryOptionLabel}
        isOptionEqualToValue={(o, v) => o._id === v?._id}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Category"
            placeholder="Search or add"
            fullWidth
          />
        )}
      />
    );
  }

  /* ---------- URL metadata (affiliate) ---------- */

  const urlDebounce = useRef();
  useEffect(() => {
    if (!affUrl) {
      setAffThumb(null);
      setMetaError(null);
      return;
    }
    clearTimeout(urlDebounce.current);
    setMetaError(null);

    urlDebounce.current = setTimeout(async () => {
      try {
        setMetaLoading(true);
        const res = await axios.post(
          `${API_BASE}/url-metadata`,
          { url: affUrl },
          { timeout: 20000 }
        );
        const { title, image, error } = res?.data || {};
        if (error) setMetaError(error);
        if (!affTitle && title) setAffTitle(title);
        setAffThumb(image || null);
      } catch (e) {
        console.warn("Metadata fetch failed:", e.message);
        setMetaError("Could not load preview");
        setAffThumb(null);
      } finally {
        setMetaLoading(false);
      }
    }, 500);

    return () => clearTimeout(urlDebounce.current);
  }, [affUrl]); // eslint-disable-line

  // Manual image changes
  function handleAffManualFileChange(e) {
    const f = e.target.files?.[0];
    setAffManualFile(f || null);
    setAffManualPreview(f ? URL.createObjectURL(f) : null);
  }

  function handleDigFileChange(e) {
    const f = e.target.files?.[0];
    setDigFile(f || null);
    setDigPreview(f ? URL.createObjectURL(f) : null);
  }

  /* ---------- Dialog open/close ---------- */

  function openAddDialog() {
    setIsEditing(false);
    setEditingProductId(null);
    setEditingProductType(null); // NEW: reset product type
    setActiveTab(0);

    setAffTitle("");
    setAffUrl("");
    setAffCategory(null);
    setAffThumb(null);
    setAffManualFile(null);
    setAffManualPreview(null);

    setDigCategory(null);
    setDigName("");
    setDigDesc("");
    setDigPrice("");
    setDigFile(null);
    setDigPreview(null);

    setDialogOpen(true);
  }

function openEditDialog(product) {
  setIsEditing(true);
  setEditingProductId(product._id);
  setEditingProductType(product.type);
  const isDigital = product.type === "digital";
  setActiveTab(isDigital ? 1 : 0);

  // NEW: Get category from populated productCategory object
  const categoryToSet = product.productCategory || null;

  if (isDigital) {
    setDigName(product.title || "");
    setDigDesc(product.description || "");
    setDigPrice(product.price ?? "");
    setDigCategory(categoryToSet); // ← Use populated productCategory
    setDigFile(null);
    setDigPreview(product.imageUrl || null);

    setAffTitle("");
    setAffUrl(product.link || "");
    setAffCategory(categoryToSet); // ← Use populated productCategory
    setAffThumb(product.imageUrl || null);
    setAffManualFile(null);
    setAffManualPreview(null);
  } else {
    setAffTitle(product.title || "");
    setAffUrl(product.link || "");
    setAffCategory(categoryToSet); // ← Use populated productCategory
    setAffThumb(product.imageUrl || null);
    setAffManualFile(null);
    setAffManualPreview(product.imageUrl || null);

    setDigName("");
    setDigDesc("");
    setDigPrice("");
    setDigCategory(null);
    setDigFile(null);
    setDigPreview(null);
  }
  setDialogOpen(true);
}


  async function handleDelete(id) {
    if (!window.confirm("Delete this product?")) return;
    try {
      await axios.delete(`${API_BASE}/delete-product/${id}`);
      fetchProducts(page + 1, limit);
    } catch (err) {
      console.error("Delete product error:", err);
      alert("Error deleting product.");
    }
  }

  /* ---------- Save ---------- */

  const [saving, setSaving] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      if (activeTab === 0) {
        // Affiliate Link
        if (!affTitle || !affUrl) {
          alert("Please enter Product Title and a valid URL.");
          setSaving(false);
          return;
        }
        const payload = new FormData();
        payload.append("type", "affiliate");
        payload.append("title", affTitle);
        payload.append("link", affUrl);
        if (affCategory?._id) payload.append("category_id", affCategory._id);
        if (affCategory?.name)
          payload.append("category_name", affCategory.name);
        if (affManualFile) payload.append("image", affManualFile);
        else if (affThumb) payload.append("imageUrlFromMeta", affThumb);

        if (isEditing && editingProductId) {
          await axios.post(
            `${API_BASE}/edit-product/${editingProductId}`,
            payload
          );
        } else {
          await axios.post(`${API_BASE}/upload-product`, payload);
        }
      } else {
        // Digital Product
        if (!digName) {
          alert("Please enter Product Name.");
          setSaving(false);
          return;
        }
        const payload = new FormData();
        payload.append("type", "digital");
        payload.append("title", digName);
        payload.append("description", digDesc || "");
        if (digPrice !== "") payload.append("price", String(digPrice));
        if (digCategory?._id) payload.append("category_id", digCategory._id);
        if (digCategory?.name)
          payload.append("category_name", digCategory.name);
        if (digFile) payload.append("image", digFile);

        if (isEditing && editingProductId) {
          await axios.post(
            `${API_BASE}/edit-product/${editingProductId}`,
            payload
          );
        } else {
          await axios.post(`${API_BASE}/upload-product`, payload);
        }
      }

      await fetchProducts(page + 1, limit);
      setDialogOpen(false);
    } catch (err) {
      console.error("Save product error:", err);
      alert(err?.response?.data?.message || "Error saving product.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Pagination handlers ---------- */

  const handleChangePage = (_, newPage) => setPage(newPage - 1);
  const totalPages = Math.ceil(total / limit);

  /* ---------- Client-side refinement for the CURRENT page ---------- */

  const refined = useMemo(() => {
    let list = [...products];

    // filter by type
    if (typeFilter !== "all") {
      list = list.filter((p) => p.type === typeFilter);
    }

    // text search
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((p) => {
        const t = (p.title || "").toLowerCase();
        const l = (p.link || "").toLowerCase();
        return t.includes(term) || l.includes(term);
      });
    }

    // sort
    list.sort((a, b) => {
      if (sortBy.startsWith("createdAt")) {
        const da = new Date(a.createdAt || a.created_at || 0).getTime();
        const db = new Date(b.createdAt || b.created_at || 0).getTime();
        return sortBy.endsWith("asc") ? da - db : db - da;
      }
      if (sortBy.startsWith("title")) {
        const ta = (a.title || "").toLowerCase();
        const tb = (b.title || "").toLowerCase();
        if (ta < tb) return sortBy.endsWith("asc") ? -1 : 1;
        if (ta > tb) return sortBy.endsWith("asc") ? 1 : -1;
        return 0;
      }
      return 0;
    });

    return list;
  }, [products, q, typeFilter, sortBy]);

  /* ---------- Responsive Item renderers ---------- */

  function ProductRow({ p, idx }) {
    const displayDate = p.createdAt || p.created_at;
    return (
      <TableRow key={p._id}>
        <TableCell sx={{ fontWeight: 500 }}>
          {page * limit + idx + 1}
        </TableCell>
        <TableCell sx={{ fontSize: "0.875rem" }}>
          {displayDate
            ? format(new Date(displayDate), "MMM dd, yyyy")
            : "-"}
        </TableCell>
        <TableCell>
          {p.type === "affiliate" ? (
            <AffiliateThumb product={p} />
          ) : (
            <Avatar
              variant="rounded"
              src={p.imageUrl || undefined}
              alt={p.title}
              sx={{ width: 56, height: 56 }}
            />
          )}
        </TableCell>
        <TableCell>
          <Stack spacing={0.5}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, maxWidth: 200 }}
              noWrap
            >
              {p.title}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Chip
                size="small"
                label={p.type === "digital" ? "Digital" : "Affiliate"}
                color={p.type === "digital" ? "primary" : "default"}
                variant={p.type === "digital" ? "filled" : "outlined"}
              />
              {p.price != null && p.type === "digital" && (
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  ₹{p.price}
                </Typography>
              )}
            </Stack>
          </Stack>
        </TableCell>
        <TableCell sx={{ fontSize: "0.875rem" }}>
          {p.link ? (
            <Tooltip title={p.link}>
              <a
                href={p.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: "none",
                  color: theme.palette.primary.main,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", maxWidth: 150 }}
                  noWrap
                >
                  {truncate(p.link, 25)}
                </Typography>
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </a>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.secondary">
              -
            </Typography>
          )}
        </TableCell>
        <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
          <Tooltip title="Edit">
            <IconButton
              onClick={() => openEditDialog(p)}
              size="small"
              sx={{
                transition: theme.transitions.create(["color"]),
                "&:hover": { color: theme.palette.primary.main },
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              onClick={() => handleDelete(p._id)}
              size="small"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  }

  function ProductCard({ p, idx }) {
    const displayDate = p.createdAt || p.created_at;
    return (
      <StyledProductCard key={p._id}>
        <CardContent sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            {p.type === "affiliate" ? (
              <AffiliateThumb product={p} />
            ) : (
              <Avatar
                variant="rounded"
                src={p.imageUrl || undefined}
                alt={p.title}
                sx={{ width: 56, height: 56, flexShrink: 0 }}
              />
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 0.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {p.title}
              </Typography>
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{ flexWrap: "wrap", mb: 0.75 }}
              >
                <Chip
                  size="small"
                  label={p.type === "digital" ? "Digital" : "Affiliate"}
                  color={p.type === "digital" ? "primary" : "default"}
                  variant={p.type === "digital" ? "filled" : "outlined"}
                />
                {p.price != null && p.type === "digital" && (
                  <Chip size="small" label={`₹${p.price}`} variant="outlined" />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {displayDate
                  ? format(new Date(displayDate), "MMM dd, yyyy")
                  : "-"}
              </Typography>

              {p.link ? (
                <Box sx={{ mt: 0.75 }}>
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        color: theme.palette.primary.main,
                        wordBreak: "break-all",
                        textDecoration: "underline",
                        textDecorationColor: "transparent",
                        transition: theme.transitions.create([
                          "text-decoration-color",
                        ]),
                        "&:hover": {
                          textDecorationColor: theme.palette.primary.main,
                        },
                      }}
                    >
                      {truncate(p.link, 30)} <OpenInNewIcon fontSize="inherit" />
                    </Typography>
                  </a>
                </Box>
              ) : null}
            </Box>
          </Stack>
        </CardContent>
        <CardActions
          sx={{
            pt: 0,
            pb: 1,
            px: 2,
            justifyContent: "flex-end",
            gap: 0.5,
          }}
        >
          <Button
            size="small"
            startIcon={<EditIcon />}
            onClick={() => openEditDialog(p)}
            variant="text"
          >
            Edit
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => handleDelete(p._id)}
            variant="text"
          >
            Delete
          </Button>
        </CardActions>
      </StyledProductCard>
    );
  }

  /* ---------- Render ---------- */

  return (
    <Container maxWidth="lg" disableGutters>
      <Box sx={{ px: { xs: 1, sm: 2, md: 3 }, py: { xs: 2, sm: 3, md: 4 } }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                p: 1,
                borderRadius: 1,
                bgcolor: (theme) =>
                  alpha(theme.palette.primary.main, 0.1),
              }}
            >
              <StorefrontIcon sx={{ color: "primary.main" }} />
            </Box>
            <Stack spacing={0}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Store
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily : 'Inter'}}>
                Manage affiliate & digital products
              </Typography>
            </Stack>
          </Stack>
          <Stack
            direction={{ xs: "column-reverse", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={storeEnabled}
                  onChange={(e) => toggleStoreEnabled(e.target.checked)}
                  disabled={toggling}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {toggling ? "Updating..." : "Enable Store"}
                </Typography>
              }
              sx={{ m: 0 }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAddDialog}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 1,
                px: 2,
              }}
            >
              Add Product
            </Button>
          </Stack>
        </Stack>

        {/* Sticky Controls Bar */}
        <StyledControlsBar elevation={0}>
          <Stack spacing={2}>
            <StyledSearchField
              size="small"
              fullWidth
              placeholder="Search by title or link..."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              value={q}
              onChange={(e) => {
                const val = e.target.value;
                clearTimeout(qDebounce.current);
                qDebounce.current = setTimeout(() => setQ(val), 0);
              }}
            />
          
          </Stack>
        </StyledControlsBar>

        {/* Content */}
        <Paper
          variant="outlined"
          sx={{
            borderRadius: { xs: 1, sm: 1.5 },
            overflow: { xs: "hidden", md: "visible" },
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            boxShadow: `0 1px 3px ${alpha(theme.palette.common.black, 0.06)}`,
          }}
        >
          {loading ? (
            <Box sx={{ p: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={40} />
            </Box>
          ) : refined.length === 0 ? (
            <Box
              sx={{
                p: { xs: 3, sm: 6 },
                textAlign: "center",
                background: `linear-gradient(135deg, ${alpha(
                  theme.palette.primary.main,
                  0.05
                )} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  bgcolor: (theme) =>
                    alpha(theme.palette.primary.main, 0.1),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mx: "auto",
                  mb: 2,
                }}
              >
                <StorefrontIcon
                  sx={{ fontSize: 40, color: "primary.main" }}
                />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                No products yet
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 3, maxWidth: 400, mx: "auto" }}
              >
                Start building your store by adding your first affiliate link
                or digital product. You can upload images, set prices, and
                organize by categories.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openAddDialog}
              >
                Add First Product
              </Button>
            </Box>
          ) : (
            <>
              {isMdUp ? (
                <StyledTableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell width={60}>S.No</TableCell>
                        <TableCell width={140}>Date</TableCell>
                        <TableCell width={70}>Image</TableCell>
                        <TableCell sx={{ minWidth: 200 }}>Product</TableCell>
                        <TableCell sx={{ minWidth: 180 }}>Link</TableCell>
                        <TableCell align="center" width={120}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {refined.map((p, idx) => (
                        <ProductRow key={p._id} p={p} idx={idx} />
                      ))}
                    </TableBody>
                  </Table>
                </StyledTableContainer>
              ) : (
                <Box
                  sx={{
                    p: { xs: 1, sm: 1.5 },
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                    },
                    gap: { xs: 1, sm: 1.5 },
                  }}
                >
                  {refined.map((p, idx) => (
                    <ProductCard key={p._id} p={p} idx={idx} />
                  ))}
                </Box>
              )}

              {/* Pagination */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  p: 2.5,
                  borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                }}
              >
                <Pagination
                  count={totalPages}
                  page={page + 1}
                  onChange={handleChangePage}
                  color="primary"
                  size={isXs ? "small" : "medium"}
                  showFirstButton
                  showLastButton
                  sx={{
                    "& .MuiPaginationItem-root": {
                      fontWeight: 600,
                    },
                  }}
                />
              </Box>
            </>
          )}
        </Paper>

     {/* Add / Edit Dialog */}
<Dialog
  open={dialogOpen}
  onClose={() => setDialogOpen(false)}
  fullWidth
  maxWidth="sm"
  fullScreen={isXs}
  PaperProps={{
    sx: {
      borderRadius: isXs ? 0 : 2,
      backgroundImage: `linear-gradient(135deg, ${alpha(
        theme.palette.background.paper,
        0.95
      )} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
    },
  }}
>
  <DialogTitle sx={{ fontWeight: 800, fontSize: "1.25rem" }}>
    {isEditing ? "Edit Product" : "Add New Product"}
  </DialogTitle>
  <DialogContent>
    {/* CONDITIONAL TABS - Only show if adding new product */}
    {!isEditing && (
      <>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="fullWidth"
          sx={{ mb: 2 }}
          TabIndicatorProps={{
            sx: {
              height: 3,
              borderRadius: 1.5,
            },
          }}
        >
          <Tab label="Affiliate Link" {...a11yProps(0)} />
          <Tab label="Digital Product" {...a11yProps(1)} />
        </Tabs>
        <Divider />
      </>
    )}

    {/* Affiliate Link Tab - Show when: adding product OR editing affiliate product */}
    {(!isEditing || editingProductType === "affiliate") && (
      <TabPanel
        value={activeTab}
        index={0}
      >
        <Stack spacing={2.5}>
          {renderCategoryAutocomplete(affCategory, setAffCategory)}
          <TextField
            label="Product URL"
            placeholder="https://example.com/product"
            fullWidth
            value={affUrl}
            onChange={(e) => setAffUrl(e.target.value)}
            inputMode="url"
            variant="outlined"
          />
          <TextField
            label="Product Title"
            placeholder="e.g., Amazing Product Name"
            fullWidth
            value={affTitle}
            onChange={(e) => setAffTitle(e.target.value)}
            variant="outlined"
          />

          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, mb: 1.5 }}
            >
              Product Image
            </Typography>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {metaLoading && <CircularProgress size={24} />}
                {(affManualPreview || affThumb) && !metaLoading && (
                  <Avatar
                    variant="rounded"
                    src={affManualPreview || affThumb || undefined}
                    alt="preview"
                    sx={{ width: 80, height: 80 }}
                  />
                )}
                {!affManualPreview &&
                  !affThumb &&
                  !metaLoading && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontStyle: "italic" }}
                    >
                      {metaError
                        ? "⚠️ Auto-fetch failed. Upload manually."
                        : "Paste a URL to auto-load thumbnail"}
                    </Typography>
                  )}
              </Stack>

              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 1,
                }}
              >
                {affManualPreview ? "Change Image" : "Upload Image"}
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={handleAffManualFileChange}
                />
              </Button>
            </Stack>
          </Box>
        </Stack>
      </TabPanel>
    )}

    {/* Digital Product Tab - Show when: adding product OR editing digital product */}
    {(!isEditing || editingProductType === "digital") && (
      <TabPanel
        value={activeTab}
        index={1}
      >
        <Stack spacing={2.5}>
        {renderCategoryAutocomplete(digCategory, setDigCategory)}
          <TextField
            label="Product Name"
            placeholder="e.g., E-book Title"
            fullWidth
            value={digName}
            onChange={(e) => setDigName(e.target.value)}
            variant="outlined"
          />
          <TextField
            label="Description"
            placeholder="Describe your product..."
            fullWidth
            multiline
            minRows={3}
            value={digDesc}
            onChange={(e) => setDigDesc(e.target.value)}
            variant="outlined"
          />
          <Stack spacing={1.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Upload
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="flex-end">
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 1,
                }}
              >
                Upload File
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={handleDigFileChange}
                />
              </Button>
              {digPreview && (
                <Avatar
                  variant="rounded"
                  src={digPreview}
                  alt="preview"
                  sx={{ width: 80, height: 80 }}
                />
              )}
            </Stack>
          </Stack>
          {/* <TextField
            label="Price"
            placeholder="₹ 99.00"
            type="number"
            inputProps={{ step: "0.01", min: 0 }}
            value={digPrice}
            onChange={(e) => setDigPrice(e.target.value)}
            variant="outlined"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">₹</InputAdornment>
              ),
            }}
          /> */}
        </Stack>
      </TabPanel>
    )}
  </DialogContent>

  <DialogActions
    sx={{
      p: 2.5,
      gap: 1,
      borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
    }}
  >
    <Button
      onClick={() => setDialogOpen(false)}
      disabled={saving}
      variant="text"
      sx={{ textTransform: "none", fontWeight: 600 }}
    >
      Cancel
    </Button>
    <Button
      variant="contained"
      onClick={handleSave}
      disabled={saving}
      sx={{ textTransform: "none", fontWeight: 600, minWidth: 100 }}
    >
      {saving ? "Saving..." : "Save Product"}
    </Button>
  </DialogActions>
</Dialog>

      </Box>
    </Container>
  );
}
