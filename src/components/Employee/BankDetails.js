import { useEffect, useState } from "react";
import {
  Box,
  Grid,
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import axios from "axios";

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

export default function BankDetails() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [data, setData] = useState(null); // normalized { name, bankName, accountNumber, ifsc } or null
  const baseUrl = "/api/usersOn";

  const [form, setForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
  });

  // Normalize API response to a single shape used by UI
  const normalizeBankDetails = (bd) => {
    if (!bd) return null;
    const name = bd.name ?? bd.name_on_bank ?? "";
    const bankName = bd.bankName ?? bd.bank_name ?? "";
    const accountNumberRaw = bd.accountNumber ?? bd.account_number ?? "";
    const ifsc = (bd.ifsc ?? bd.bank_ifsc ?? "").toString().toUpperCase();
    const accountNumber = accountNumberRaw != null ? String(accountNumberRaw) : "";
    return { name, bankName, accountNumber, ifsc };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await axios.get(`${baseUrl}/bank-details`, {
          withCredentials: true,
        });
        if (!mounted) return;
        const bd = normalizeBankDetails(res?.data?.bankDetails ?? null);
        setData(bd);
        if (!bd) setEditMode(true);
      } catch (e) {
        setError(e?.response?.data?.message || "Failed to load bank details.");
        setEditMode(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name || "",
        bankName: data.bankName || "",
        accountNumber: data.accountNumber || "",
        ifsc: data.ifsc || "",
      });
    }
  }, [data]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const validate = () => {
    if (!form.name.trim() || !form.bankName.trim() || !form.accountNumber.trim() || !form.ifsc.trim()) {
      setError("All fields are required.");
      return false;
    }
    if (!IFSC_REGEX.test(form.ifsc.trim())) {
      setError("Please enter a valid IFSC code (e.g., HDFC0001234).");
      return false;
    }
    if (!/^\d{6,18}$/.test(form.accountNumber.trim())) {
      setError("Account Number should be 6–18 digits.");
      return false;
    }
    return true;
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    setError("");
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
      };
      const res = await axios.post(`${baseUrl}/bank-details`, payload, {
        withCredentials: true,
      });
      const bd = normalizeBankDetails(res?.data?.bankDetails);
      setData(bd);
      setEditMode(false);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to save bank details.");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setError("");
    if (data) {
      setForm({
        name: data.name || "",
        bankName: data.bankName || "",
        accountNumber: data.accountNumber || "",
        ifsc: data.ifsc || "",
      });
      setEditMode(false);
    } else {
      setForm({ name: "", bankName: "", accountNumber: "", ifsc: "" });
    }
  };

  const maskedAccount = (acc) =>
    acc?.length > 4 ? `••••••••${acc.slice(-4)}` : acc || "";

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="h6">Bank Details</Typography>
          {!loading && data && !editMode && (
            <Button startIcon={<EditIcon />} onClick={() => setEditMode(true)} variant="text">
              Edit
            </Button>
          )}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box component="form" onSubmit={onSave}>
            <Grid container spacing={2}>
              {/* Name on bank */}
              <Grid size={{ xs: 12, md: 6}}>
                <TextField
                  fullWidth
                  label="Name (as per bank records)"
                  name="name"
                  value={form.name}
                  onChange={onChange}
                  required
                  InputProps={{ readOnly: !editMode }}
                />
              </Grid>

              {/* Bank Name */}
              <Grid size={{ xs: 12, md: 6}}>
                <TextField
                  fullWidth
                  label="Bank Name"
                  name="bankName"
                  value={form.bankName}
                  onChange={onChange}
                  required
                  placeholder="e.g., HDFC Bank"
                  InputProps={{ readOnly: !editMode }}
                />
              </Grid>

              {/* Account Number */}
              <Grid size={{ xs: 12, md: 6}}>
                <TextField
                  fullWidth
                  label="Account Number"
                  name="accountNumber"
                  value={editMode ? form.accountNumber : maskedAccount(form.accountNumber)}
                  onChange={onChange}
                  required
                  inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                  InputProps={{ readOnly: !editMode }}
                />
              </Grid>

              {/* IFSC */}
              <Grid size={{ xs: 12, md: 6}}>
                <TextField
                  fullWidth
                  label="IFSC Code"
                  name="ifsc"
                  value={form.ifsc}
                  onChange={(e) =>
                    onChange({ target: { name: "ifsc", value: e.target.value.toUpperCase() } })
                  }
                  required
                  placeholder="e.g., HDFC0001234"
                  InputProps={{ readOnly: !editMode }}
                />
              </Grid>

              {/* Actions */}
              <Grid size={{ xs: 12}}>
                {editMode && (
                  <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                    <Button type="button" variant="outlined" startIcon={<CloseIcon />} onClick={onCancel} disabled={saving}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </Box>
                )}
              </Grid>
            </Grid>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
